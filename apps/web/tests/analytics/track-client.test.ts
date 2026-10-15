// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sent = { url: string; body: { events: Array<Record<string, unknown>>; utm?: Record<string, string> }; via: 'fetch' | 'beacon' };

let sent: Sent[] = [];

async function loadTracker() {
  vi.resetModules(); // fresh queue and listeners per test
  return import('@/lib/analytics/track');
}

beforeEach(() => {
  sent = [];
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/search/?q=x&utm_source=newsletter');
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), via: 'fetch' });
      return new Response(null, { status: 204 });
    }),
  );
  Object.defineProperty(window.navigator, 'sendBeacon', {
    configurable: true,
    value: vi.fn((url: string, body: string) => {
      sent.push({ url, body: JSON.parse(body), via: 'beacon' });
      return true;
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('track() in the browser', () => {
  it('batches events and sends them together after a short delay', async () => {
    const { track } = await loadTracker();
    track('search_submitted', { query: 'כמה עולה שלד' });
    track('consultation_clicked', { source: 'header', variant: 'button' });
    expect(sent).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1600);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: '/api/track', via: 'fetch' });
    expect(sent[0].body.events.map((e) => e.name)).toEqual(['search_submitted', 'consultation_clicked']);
    expect(sent[0].body.events[0]).toMatchObject({ props: { query: 'כמה עולה שלד' }, path: '/search/' });
    expect(sent[0].body.utm).toEqual({ utm_source: 'newsletter' });
  });

  it('keeps landing UTMs for the rest of the session', async () => {
    const { track, flush } = await loadTracker();
    track('page_view');
    flush();
    window.history.replaceState(null, '', '/blog/');
    track('page_view');
    flush();
    expect(sent.map((s) => s.body.utm)).toEqual([{ utm_source: 'newsletter' }, { utm_source: 'newsletter' }]);
  });

  it('flushes with sendBeacon when the page is hidden or left', async () => {
    const { track } = await loadTracker();
    track('video_play', { youtube_id: 'abc123' });
    window.dispatchEvent(new Event('pagehide'));
    expect(sent).toHaveLength(1);
    expect(sent[0].via).toBe('beacon');
  });

  it('sends at 25 events without waiting', async () => {
    const { track } = await loadTracker();
    for (let i = 0; i < 25; i++) track('page_view');
    expect(sent).toHaveLength(1);
    expect(sent[0].body.events).toHaveLength(25);
  });

  it('sends flat, short props only', async () => {
    const { track, flush } = await loadTracker();
    (track as (n: string, p: unknown) => void)('search_submitted', {
      query: 'x'.repeat(2000),
      nested: { a: 1 },
      list: [1],
      n: Number.NaN,
      ok: true,
    });
    flush();
    expect(sent[0].body.events[0].props).toEqual({ query: 'x'.repeat(500), ok: true });
  });

  it('never throws, even when the network layer does', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('offline');
    });
    const { track, flush } = await loadTracker();
    expect(() => {
      track('page_view');
      flush();
    }).not.toThrow();
  });

  it('records page views with a referrer', async () => {
    const { trackPageView, flush } = await loadTracker();
    trackPageView({ referrer: '/blog/', q: 'ממ"ד' });
    flush();
    expect(sent[0].body.events[0]).toMatchObject({ name: 'page_view', referrer: '/blog/', props: { q: 'ממ"ד' } });
  });
});
