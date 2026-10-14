import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PlatformEventInsert } from '@/lib/platform/types';

const state = vi.hoisted(() => ({
  rows: [] as PlatformEventInsert[],
  insert: null as null | ((rows: PlatformEventInsert[]) => Promise<number>),
  userId: null as string | null,
}));

vi.mock('@/lib/analytics/store', () => ({
  insertPlatformEvents: vi.fn(async (rows: PlatformEventInsert[]) => {
    if (state.insert) return state.insert(rows);
    state.rows.push(...rows);
    return rows.length;
  }),
}));
vi.mock('@/lib/auth/session', () => ({
  getUser: vi.fn(async () => (state.userId ? { id: state.userId } : null)),
}));

import { POST } from '@/app/api/track/route';
import { insertPlatformEvents } from '@/lib/analytics/store';
import { resetRateLimitMemory } from '@/lib/guard/rateLimit';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const AID = '0b6b1a52-5d1e-4c3a-9f4e-2a7d8c9e0f11';
const NOW = Date.parse('2026-10-14T09:00:00Z');

type Body = { events?: unknown[]; utm?: Record<string, unknown> } | string;

function req(body: Body, opts: { ua?: string; ip?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'text/plain;charset=UTF-8',
    'user-agent': opts.ua ?? CHROME,
    'x-forwarded-for': opts.ip ?? '203.0.113.10',
    'sec-fetch-site': 'same-origin',
    referer: 'http://localhost:3103/',
    ...opts.headers,
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest('http://localhost:3103/api/track', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const pageView = (path = '/search/', extra: Record<string, unknown> = {}) => ({
  name: 'page_view',
  props: { q: 'כמה עולה שלד' },
  ts: NOW - 1000,
  path,
  referrer: 'https://www.google.com/search?q=private',
  ...extra,
});

beforeEach(() => {
  state.rows = [];
  state.insert = null;
  state.userId = null;
  resetRateLimitMemory();
  vi.mocked(insertPlatformEvents).mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.LEAD_IP_SALT = 'test-salt';
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.FLAG_ANALYTICS;
});

describe('POST /api/track', () => {
  it('stores valid events with visitor context and sets the visitor cookies', async () => {
    const res = await POST(req({ events: [pageView()], utm: { utm_source: 'facebook', email: 'x@y.z' } }, { ua: IPHONE }));
    expect(res.status).toBe(204);
    expect(res.headers.get('x-bb-track')).toBe('stored');
    expect(state.rows).toHaveLength(1);
    const row = state.rows[0];
    expect(row).toMatchObject({
      name: 'page_view',
      path: '/search/',
      referrer: 'https://www.google.com/search',
      props: { q: 'כמה עולה שלד' },
      utm: { utm_source: 'facebook' },
      device: 'mobile',
      is_demo: false,
      user_id: null,
      occurred_at: new Date(NOW - 1000).toISOString(),
    });
    expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.anon_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.session_id).toMatch(/^[0-9a-f-]{36}$/);

    const aid = res.cookies.get('bb_aid');
    const sid = res.cookies.get('bb_sid');
    expect(aid?.value).toBe(row.anon_id);
    expect(aid?.httpOnly).toBe(true);
    expect(aid?.sameSite).toBe('lax');
    expect(sid?.value).toBe(row.session_id);
    expect(sid?.maxAge).toBe(1800);
  });

  it('reuses an existing visitor cookie and only refreshes the session', async () => {
    const res = await POST(req({ events: [pageView()] }, { cookie: `bb_aid=${AID}` }));
    expect(state.rows[0].anon_id).toBe(AID);
    expect(res.cookies.get('bb_aid')).toBeUndefined();
    expect(res.cookies.get('bb_sid')).toBeDefined();
  });

  it('links signed-in members', async () => {
    state.userId = '11111111-2222-4333-8444-555555555555';
    await POST(req({ events: [pageView()] }));
    expect(state.rows[0].user_id).toBe(state.userId);
  });

  it('flags /platform traffic as demo', async () => {
    await POST(req({ events: [pageView('/platform/demo/foundation/')] }));
    expect(state.rows[0].is_demo).toBe(true);
  });

  it('validates each event on its own: unknown, invalid and server-only events are dropped', async () => {
    const res = await POST(
      req({
        events: [
          pageView(),
          { name: 'made_up', props: {} },
          { name: 'search_submitted', props: {} }, // query missing
          { name: 'lead_submitted', props: { lead_type: 'consultation' } }, // server-only
          { name: 'search_submitted', props: { query: 'ממ"ד', source: 'hero' } },
          'garbage',
        ],
      }),
    );
    expect(res.status).toBe(204);
    expect(state.rows.map((r) => r.name)).toEqual(['page_view', 'search_submitted']);
    expect(res.headers.get('x-bb-track-accepted')).toBe('2');
    expect(res.headers.get('x-bb-track-dropped')).toBe('4');
  });

  it('caps a batch at 25 events', async () => {
    await POST(req({ events: Array.from({ length: 40 }, () => pageView()) }));
    expect(state.rows).toHaveLength(25);
  });

  it('drops bots and headless browsers without storing anything', async () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
      'curl/8.7.1',
      '',
    ]) {
      const res = await POST(req({ events: [pageView()] }, { ua }));
      expect(res.status).toBe(204);
      expect(res.headers.get('x-bb-track')).toBe('bot');
    }
    expect(insertPlatformEvents).not.toHaveBeenCalled();
  });

  it('drops cross-site posts', async () => {
    const res = await POST(req({ events: [pageView()] }, { headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(res.headers.get('x-bb-track')).toBe('cross_site');
    expect(insertPlatformEvents).not.toHaveBeenCalled();
  });

  it('rate-limits by IP hash (120 batches a minute) without failing the request', async () => {
    const ip = '198.51.100.77';
    for (let i = 0; i < 120; i++) {
      const res = await POST(req({ events: [pageView()] }, { ip }));
      expect(res.headers.get('x-bb-track')).toBe('stored');
    }
    const limited = await POST(req({ events: [pageView()] }, { ip }));
    expect(limited.status).toBe(204);
    expect(limited.headers.get('x-bb-track')).toBe('rate_limited');
    expect(state.rows).toHaveLength(120);

    // Another visitor is unaffected.
    const other = await POST(req({ events: [pageView()] }, { ip: '198.51.100.78' }));
    expect(other.headers.get('x-bb-track')).toBe('stored');

    // A minute later the window has slid.
    vi.setSystemTime(NOW + 120_000);
    const later = await POST(req({ events: [pageView()] }, { ip }));
    expect(later.headers.get('x-bb-track')).toBe('stored');
  });

  it('is fail-open: a storage outage is still a 204', async () => {
    state.insert = async () => 0; // DB down: store reports nothing stored
    const down = await POST(req({ events: [pageView()] }));
    expect(down.status).toBe(204);
    expect(down.headers.get('x-bb-track-accepted')).toBe('0');
    expect(down.cookies.get('bb_aid')).toBeDefined();

    state.insert = async () => {
      throw new Error('boom');
    };
    const thrown = await POST(req({ events: [pageView()] }));
    expect(thrown.status).toBe(204);
    expect(thrown.headers.get('x-bb-track')).toBe('error');
  });

  it('answers 400 only to unparsable JSON, and 204 to empty batches', async () => {
    expect((await POST(req('{not json'))).status).toBe(400);
    const empty = await POST(req({ events: [] }));
    expect(empty.status).toBe(204);
    expect(empty.headers.get('x-bb-track')).toBe('empty');
    const notObject = await POST(req('[1,2,3]'));
    expect(notObject.headers.get('x-bb-track')).toBe('empty');
  });

  it('refuses oversized bodies', async () => {
    const res = await POST(req({ events: [pageView('/x/', { props: { q: 'x'.repeat(40_000) } })] }));
    expect(res.headers.get('x-bb-track')).toBe('too_large');
    expect(insertPlatformEvents).not.toHaveBeenCalled();
  });

  it('honours the analytics kill switch', async () => {
    process.env.FLAG_ANALYTICS = 'false';
    const res = await POST(req({ events: [pageView()] }));
    expect(res.headers.get('x-bb-track')).toBe('disabled');
    expect(res.cookies.get('bb_aid')).toBeUndefined();
    expect(insertPlatformEvents).not.toHaveBeenCalled();
  });
});
