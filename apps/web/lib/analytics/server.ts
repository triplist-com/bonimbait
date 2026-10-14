import 'server-only';

/**
 * Server-side analytics: trackServer() for facts the server knows (a stored
 * lead, a revealed phone, a finished AI answer).
 *
 *   // Server Action: context comes from next/headers (cookies, Referer, IP).
 *   await trackServer('phone_reveal', { business_id });
 *
 *   // Route Handler: pass the request (works inside streaming callbacks too).
 *   await trackServer('answer_completed', { ... }, { request });
 *
 * The visitor's bb_aid / bb_sid cookies (set by POST /api/track) link server
 * events to the same visitor and session as browser events. trackServer never
 * throws and gives up after ~2s; awaiting it is safe.
 */
import { headers } from 'next/headers';
import { isEnabled } from '@/lib/flags';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';
import { isPlatformPath } from '@/lib/platform/paths';
import type { DeviceKind, PlatformEventInsert } from '@/lib/platform/types';
import { SITE_URL } from '@/lib/site';
import { ANON_COOKIE, SESSION_COOKIE } from './constants';
import { validateEvent, type EventName, type EventProps, type ValidatedEvent } from './events';
import { clampOccurredAt, deviceFromUserAgent, isUuid, sanitizePath, sanitizeReferrer } from './sanitize';
import { insertPlatformEvents } from './store';

type HeaderBag = { get(name: string): string | null };

/** Everything about the visitor/request that goes on an event row. */
export type TrackContext = {
  anonId: string | null;
  sessionId: string | null;
  userId: string | null;
  ipHash: string | null;
  device: DeviceKind | null;
  path: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  isDemo: boolean;
};

export type TrackServerOptions = {
  /** Route Handlers: read cookies and headers from this request. */
  request?: Request;
  /** Signed-in member (auth user id), if known. */
  userId?: string | null;
  /** Page the action happened on (path or absolute URL). Default: the Referer. */
  path?: string | null;
  /** Raw client IP, if the caller already has it (it is hashed here). */
  ip?: string | null;
  /** Default: true when the path is under /platform. */
  isDemo?: boolean;
  occurredAt?: Date;
};

/** Cookie value from a raw Cookie header. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

/** Visitor context from request headers (Cookie, Referer, User-Agent, IP). */
export function contextFromHeaders(
  h: HeaderBag,
  opts: Pick<TrackServerOptions, 'userId' | 'path' | 'ip' | 'isDemo'> = {},
): TrackContext {
  const cookieHeader = h.get('cookie');
  const anon = readCookie(cookieHeader, ANON_COOKIE);
  const session = readCookie(cookieHeader, SESSION_COOKIE);
  const referer = h.get('referer');
  const path = sanitizePath(opts.path ?? referer);
  return {
    anonId: isUuid(anon) ? anon : null,
    sessionId: isUuid(session) ? session : null,
    userId: isUuid(opts.userId) ? opts.userId : null,
    ipHash: hashIp(opts.ip ?? clientIpFromHeaders(h)),
    device: deviceFromUserAgent(h.get('user-agent'), h.get('sec-ch-ua-mobile')),
    path,
    referrer: null,
    utm: {},
    isDemo: opts.isDemo ?? isPlatformPath(path),
  };
}

/** next/headers outside a request scope throws; that just means "no context". */
function contextFromNextHeaders(opts: TrackServerOptions): TrackContext {
  let bag: HeaderBag = { get: () => null };
  try {
    bag = headers(); // the incoming request's headers, Cookie included
  } catch {
    // Not in a request (tests, scripts): keep the empty bag.
  }
  return contextFromHeaders(bag, opts);
}

/** One validated event + its context -> a platform_events row. */
export function buildEventRow(event: ValidatedEvent, ctx: TrackContext, occurredAt?: number | Date): PlatformEventInsert {
  return {
    occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : clampOccurredAt(occurredAt),
    name: event.name,
    anon_id: ctx.anonId,
    session_id: ctx.sessionId,
    user_id: ctx.userId,
    path: ctx.path,
    referrer: ctx.referrer ? sanitizeReferrer(ctx.referrer, SITE_URL) : null,
    utm: ctx.utm,
    props: event.props as PlatformEventInsert['props'],
    ip_hash: ctx.ipHash,
    device: ctx.device,
    is_demo: ctx.isDemo,
  };
}

export async function trackServer<N extends EventName>(
  name: N,
  props: EventProps<N>,
  opts: TrackServerOptions = {},
): Promise<void> {
  try {
    if (!isEnabled('analytics')) return;
    const checked = validateEvent(name, props);
    if (!checked.ok) {
      console.warn(`[analytics] trackServer(${name}) dropped: ${checked.error}${checked.detail ? ` (${checked.detail})` : ''}`);
      return;
    }
    const ctx = opts.request ? contextFromHeaders(opts.request.headers, opts) : contextFromNextHeaders(opts);
    await insertPlatformEvents([buildEventRow(checked.event, ctx, opts.occurredAt ?? Date.now())]);
  } catch (err) {
    console.error(`[analytics] trackServer(${name}) failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
