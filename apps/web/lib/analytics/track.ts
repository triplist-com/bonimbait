/**
 * Browser analytics: `track(name, props)`.
 *
 *   import { track } from '@/lib/analytics/track';
 *   track('search_submitted', { query });
 *   track('signup_started');                 // props optional when all are optional
 *
 * Names and props are typed by the catalog (lib/analytics/events.ts); only its
 * types are imported here, so zod stays on the server. Events are batched and
 * sent to POST /api/track ~1.5s after the first one, at 25 events, and on
 * pagehide / tab hide (sendBeacon). Every call is fire-and-forget: it never
 * throws and never waits, so it can't break the UX.
 *
 * Debug: localStorage.setItem('bb_track_debug', '1') logs each event.
 */
import type { EventName, EventProps } from './events';
import { MAX_BATCH_EVENTS, TRACK_ENDPOINT } from './constants';

type PropsArg<N extends EventName> = Record<string, never> extends EventProps<N>
  ? [props?: EventProps<N>]
  : [props: EventProps<N>];

type Queued = {
  name: string;
  props?: Record<string, string | number | boolean>;
  ts: number;
  path: string;
  referrer?: string;
};

const FLUSH_DELAY_MS = 1500;
const MAX_STRING = 500;
const UTM_KEY = 'bb_utm';

const queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function debugOn(): boolean {
  try {
    return window.localStorage.getItem('bb_track_debug') === '1';
  } catch {
    return false;
  }
}

/** Flat primitives only, long strings cut (the server re-validates anyway). */
function compactProps(props: unknown): Queued['props'] {
  if (!props || typeof props !== 'object') return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v.slice(0, MAX_STRING);
    else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** utm_* / gclid / fbclid from the landing URL, kept for the browser session. */
function sessionUtm(): Record<string, string> | undefined {
  try {
    const fresh: Record<string, string> = {};
    new URLSearchParams(window.location.search).forEach((v, k) => {
      if (/^(utm_[a-z]+|gclid|fbclid)$/.test(k) && v) fresh[k] = v.slice(0, 200);
    });
    if (Object.keys(fresh).length) {
      window.sessionStorage.setItem(UTM_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const stored = window.sessionStorage.getItem(UTM_KEY);
    return stored ? (JSON.parse(stored) as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('pagehide', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

function enqueue(item: Queued): void {
  queue.push(item);
  if (debugOn()) console.debug('[track]', item.name, item.props ?? {});
  listen();
  if (queue.length >= MAX_BATCH_EVENTS) flush();
  else if (!timer) timer = setTimeout(() => flush(), FLUSH_DELAY_MS);
}

/** Send everything queued. `beacon` = the page is going away. */
export function flush(beacon = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!inBrowser()) return;
  while (queue.length) {
    const body = JSON.stringify({ events: queue.splice(0, MAX_BATCH_EVENTS), utm: sessionUtm() });
    let sent = false;
    try {
      // A string body goes as text/plain: no CORS preflight, cookies included.
      if (beacon && typeof navigator.sendBeacon === 'function') sent = navigator.sendBeacon(TRACK_ENDPOINT, body);
    } catch {
      sent = false;
    }
    if (!sent) {
      try {
        void fetch(TRACK_ENDPOINT, {
          method: 'POST',
          body,
          keepalive: true,
          credentials: 'same-origin',
          headers: { 'content-type': 'text/plain;charset=UTF-8' },
        }).catch(() => undefined);
      } catch {
        // Analytics is best effort.
      }
    }
  }
}

export function track<N extends EventName>(name: N, ...args: PropsArg<N>): void {
  if (!inBrowser()) return;
  try {
    enqueue({ name, props: compactProps(args[0]), ts: Date.now(), path: window.location.pathname });
  } catch {
    // Never break the UX for analytics.
  }
}

/** page_view with a referrer (used by <PageViewTracker/>). */
export function trackPageView(opts: { referrer?: string | null; q?: string | null } = {}): void {
  if (!inBrowser()) return;
  try {
    enqueue({
      name: 'page_view',
      props: opts.q ? { q: opts.q.slice(0, MAX_STRING) } : undefined,
      ts: Date.now(),
      path: window.location.pathname,
      referrer: opts.referrer || undefined,
    });
  } catch {
    // Never break the UX for analytics.
  }
}

/** Test helper: queued events (not sent yet). */
export function pendingEvents(): readonly Queued[] {
  return queue;
}
