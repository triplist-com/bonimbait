import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import {
  ANON_COOKIE,
  ANON_COOKIE_MAX_AGE,
  MAX_BATCH_EVENTS,
  MAX_BODY_BYTES,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
} from '@/lib/analytics/constants';
import { isClientEvent, validateEvent } from '@/lib/analytics/events';
import { cleanUtm, isBot, isUuid, sanitizePath } from '@/lib/analytics/sanitize';
import { buildEventRow, contextFromHeaders } from '@/lib/analytics/server';
import { insertPlatformEvents } from '@/lib/analytics/store';
import { rateLimit } from '@/lib/guard/rateLimit';
import { withTimeout } from '@/lib/platform/db';
import { isPlatformPath } from '@/lib/platform/paths';
import type { PlatformEventInsert } from '@/lib/platform/types';

/**
 * POST /api/track — first-party analytics intake (lib/analytics/track.ts).
 *
 * Body (JSON; sent as text/plain by sendBeacon and keepalive fetch):
 *   { "events": [{ "name": "page_view", "props": {...}, "ts": 1760000000000,
 *                  "path": "/search/", "referrer": "https://www.google.com/" }],
 *     "utm": { "utm_source": "..." } }
 *
 * Steps: kill switch -> bot / cross-site drop -> size check -> per-IP-hash rate
 * limit -> catalog validation per event (unknown, invalid and server-only
 * events are dropped one by one) -> service-role insert. Sets the bb_aid
 * visitor cookie when missing and refreshes the 30-minute bb_sid session.
 *
 * Fail-open: every outcome except unparsable JSON is a 204, and any error
 * becomes a 204 too. The reason is in the `x-bb-track` header for debugging.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Outcome = 'stored' | 'empty' | 'bot' | 'cross_site' | 'too_large' | 'rate_limited' | 'disabled' | 'error';

function reply(outcome: Outcome, accepted = 0, dropped = 0): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set('cache-control', 'no-store');
  res.headers.set('x-bb-track', outcome);
  res.headers.set('x-bb-track-accepted', String(accepted));
  res.headers.set('x-bb-track-dropped', String(dropped));
  return res;
}

type RawEvent = { name?: unknown; props?: unknown; ts?: unknown; path?: unknown; referrer?: unknown };

async function currentUserId(): Promise<string | null> {
  try {
    // No auth cookie = no network call; a signed-in check is bounded.
    const user = await withTimeout(getUser(), 1500, 'getUser');
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isEnabled('analytics')) return reply('disabled');

    const ua = request.headers.get('user-agent');
    if (isBot(ua)) return reply('bot');
    // Browsers label requests from other sites; nobody else may post events.
    if (request.headers.get('sec-fetch-site') === 'cross-site') return reply('cross_site');

    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return reply('too_large');
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply('too_large');

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new NextResponse(null, { status: 400, headers: { 'x-bb-track': 'invalid_json' } });
    }
    const batch = body && typeof body === 'object' && !Array.isArray(body) ? (body as { events?: unknown; utm?: unknown }) : {};
    const events = Array.isArray(batch.events) ? (batch.events as RawEvent[]).slice(0, MAX_BATCH_EVENTS) : [];
    if (events.length === 0) return reply('empty');

    const ctx = contextFromHeaders(request.headers);
    const limited = await rateLimit('track', ctx.ipHash, { store: 'memory' });
    if (!limited.ok) return reply('rate_limited', 0, events.length);

    // Visitor + session ids: first-party cookies, created here when missing.
    const anonId = ctx.anonId ?? randomUUID();
    const sessionId = ctx.sessionId ?? randomUUID();
    const userId = await currentUserId();
    const utm = cleanUtm(batch.utm);

    const rows: PlatformEventInsert[] = [];
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const checked = validateEvent(e.name, e.props);
      if (!checked.ok || !isClientEvent(checked.event.name)) continue;
      const path = sanitizePath(typeof e.path === 'string' ? e.path : null) ?? ctx.path;
      rows.push(
        buildEventRow(
          checked.event,
          {
            ...ctx,
            anonId,
            sessionId,
            userId,
            path,
            referrer: typeof e.referrer === 'string' ? e.referrer : null,
            utm,
            isDemo: isPlatformPath(path),
          },
          typeof e.ts === 'number' ? e.ts : undefined,
        ),
      );
    }

    const stored = await insertPlatformEvents(rows);
    const res = reply(rows.length > 0 ? 'stored' : 'empty', stored, events.length - stored);
    const secure = request.nextUrl.protocol === 'https:' || process.env.NODE_ENV === 'production';
    if (!isUuid(request.cookies.get(ANON_COOKIE)?.value)) {
      res.cookies.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: ANON_COOKIE_MAX_AGE });
    }
    res.cookies.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_COOKIE_MAX_AGE });
    return res;
  } catch (err) {
    console.error(`[analytics] /api/track failed: ${err instanceof Error ? err.message : String(err)}`);
    return reply('error');
  }
}
