/**
 * Request checks for the public AI routes (/api/answer/stream, /api/search).
 *
 * - A page on another site can make a visitor's browser POST to us as a
 *   "simple" request (text/plain, mode: 'no-cors': no preflight), so every
 *   visitor of that page would spend our daily AI budget. Refuse cross-site
 *   browser requests, and require application/json, which a cross-site page
 *   can only send after a CORS preflight this site never grants.
 * - Rate-limit keys collapse an IPv6 address to its /64 (one household or
 *   server), so rotating addresses inside it doesn't buy fresh limits.
 *
 * Server-side; no secrets.
 */
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';

type Headers = { get(name: string): string | null };

/** A browser request from another site: Sec-Fetch-Site says so, or an Origin that isn't this host. */
export function isCrossSiteRequest(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  if (site) return site === 'cross-site';
  const origin = headers.get('origin');
  // No Origin: not a browser's cross-origin fetch (curl, server-to-server); rate limits still apply.
  if (!origin) return false;
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return true;
  try {
    return new URL(origin).host !== host.split(',')[0].trim();
  } catch {
    return true;
  }
}

/** The body is declared as JSON (Content-Type: application/json, any parameters). */
export function isJsonRequest(headers: Headers): boolean {
  return (headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() === 'application/json';
}

/** An IPv6 address's /64 network ("2001:db8:1:2::/64"), or null for IPv4 and anything unparsable. */
export function ipv6Prefix64(ip: string): string | null {
  const addr = ip.trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (!addr.includes(':') || /^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(addr)) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const groups = [...left, ...Array<string>(fill).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}

/** The visitor's rate-limit identifier: the hashed IP, with IPv6 collapsed to its /64. Null without an IP. */
export function rateLimitKey(headers: Headers): string | null {
  const ip = clientIpFromHeaders(headers);
  if (!ip) return null;
  return hashIp(ipv6Prefix64(ip) ?? ip);
}
