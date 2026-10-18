/**
 * QA guards on the public AI routes, end to end through the route handlers:
 * - POST /api/answer/stream refuses cross-site browser requests (403) and
 *   non-JSON bodies (415, e.g. a no-cors text/plain POST from another site)
 *   before any retrieval, rate-limit hit or model call;
 * - GET /api/search caps the query at 200 characters and is rate limited.
 * No network: retrieval and the model are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ rpc: vi.fn(), searched: [] as string[] }));

vi.mock('@/app/api/_lib/semantic', () => ({
  semanticSearch: vi.fn(async () => []),
  semanticSearchSegments: vi.fn(async (q: string) => {
    h.searched.push(q);
    return [];
  }),
  groupByVideo: () => new Map(),
}));
vi.mock('@/app/api/_lib/data', () => ({ getVideo: vi.fn(() => null) }));
vi.mock('@/app/api/_lib/pros', () => ({ matchPros: vi.fn(async () => null) }));
vi.mock('@/lib/advisor/posts-meta', () => ({ postsMeta: vi.fn(async () => new Map()) }));
vi.mock('@/lib/advisor/model', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/advisor/model')>();
  return { ...real, streamAnswer: vi.fn(async () => ({ parts: [], stopReason: 'end_turn', model: 'claude-sonnet-5-5' })) };
});
vi.mock('@/lib/analytics/server', () => ({ trackServer: vi.fn(async () => undefined) }));
vi.mock('@/lib/platform/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/platform/db')>();
  return { ...real, isPlatformDbConfigured: () => true, platformAdminDb: () => ({ rpc: h.rpc }) };
});

import { POST } from '@/app/api/answer/stream/route';
import { GET } from '@/app/api/search/route';
import { semanticSearch } from '@/app/api/_lib/semantic';
import { streamAnswer } from '@/lib/advisor/model';
import { resetAiBudgetCache } from '@/lib/guard/aiBudget';
import { resetRateLimitMemory } from '@/lib/guard/rateLimit';

let allowSearch = true;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.LEAD_IP_SALT = 'test-salt';
  resetAiBudgetCache();
  resetRateLimitMemory();
  h.searched = [];
  allowSearch = true;
  vi.mocked(semanticSearch).mockClear();
  vi.mocked(streamAnswer).mockClear();
  h.rpc.mockReset();
  h.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'rate_limit_hit') {
      const isSearch = String(args.p_key ?? '').startsWith('search:');
      const allowed = !isSearch || allowSearch;
      return { data: [{ allowed, used: allowed ? 1 : 60, remaining: allowed ? 59 : 0, retry_after_seconds: allowed ? 0 : 30 }], error: null };
    }
    if (fn === 'ai_spend_for_day') return { data: 0, error: null };
    return { data: null, error: null };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function streamRequest(headers: Record<string, string>, body = JSON.stringify({ query: 'כמה עולה שלד?' })) {
  return new NextRequest('http://bonimbait.test/api/answer/stream', {
    method: 'POST',
    headers: { host: 'bonimbait.test', 'x-forwarded-for': '203.0.113.9', ...headers },
    body,
  });
}

describe('POST /api/answer/stream', () => {
  it('refuses a cross-site browser request before any work', async () => {
    const res = await POST(streamRequest({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(semanticSearch).not.toHaveBeenCalled();
    expect(streamAnswer).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('refuses a no-cors text/plain POST (what another site\'s page can send without a preflight)', async () => {
    const res = await POST(streamRequest({ 'content-type': 'text/plain;charset=UTF-8' }));
    expect(res.status).toBe(415);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('still serves this site\'s own JSON requests', async () => {
    const res = await POST(streamRequest({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://bonimbait.test' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });
});

describe('GET /api/search', () => {
  const search = (q: string) => GET(new NextRequest(`http://bonimbait.test/api/search?q=${encodeURIComponent(q)}`, { headers: { 'x-forwarded-for': '203.0.113.9' } }));

  it('caps the query at 200 characters before embedding it', async () => {
    const res = await search('ש'.repeat(6000));
    expect(res.status).toBe(200);
    expect(h.searched).toHaveLength(1);
    expect(h.searched[0].length).toBe(200);
  });

  it('answers 429 without searching once the visitor is over the limit', async () => {
    allowSearch = false;
    const res = await search('כמה עולה שלד');
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(h.searched).toHaveLength(0);
  });
});
