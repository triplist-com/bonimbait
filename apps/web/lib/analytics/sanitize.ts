/**
 * Pure helpers that turn request data into clean platform_events columns.
 * No server-only imports: unit-testable and edge-safe.
 */
import type { DeviceKind } from '@/lib/platform/types';

// Crawlers, link previewers, monitors, headless browsers (incl. Lighthouse and
// our own Playwright screenshots) and HTTP libraries. `bot\b` covers most
// crawlers (Googlebot, Slackbot, TelegramBot, ClaudeBot...); app names alone
// (Slack, Telegram, Pinterest) are NOT matched: their in-app browsers are people.
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|mediapartners|bingpreview|facebookexternalhit|facebookcatalog|embedly|quora link preview|outbrain|vkshare|w3c_validator|whatsapp\/|skypeuripreview|ia_archiver|ahrefs|semrush|mj12|bytespider|chatgpt-user|claude-(?:web|user|searchbot)|anthropic-ai|perplexity-user|ccbot|uptimerobot|pingdom|statuscake|datadog|newrelic|lighthouse|pagespeed|headless|phantomjs|puppeteer|playwright|selenium|webdriver|python-requests|python-urllib|aiohttp|httpx|curl\/|wget|go-http-client|okhttp|java\/|libwww|httpclient|axios\/|node-fetch|undici|postman|insomnia|scrapy/i;

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  return ua.length < 8 || BOT_RE.test(ua);
}

/**
 * Device class from the User-Agent (plus the Sec-CH-UA-Mobile client hint).
 * iPadOS Safari reports a desktop Mac UA, so those iPads count as desktop.
 */
export function deviceFromUserAgent(userAgent: string | null | undefined, chMobile?: string | null): DeviceKind {
  const ua = userAgent ?? '';
  if (isBot(ua)) return 'bot';
  if (/iPad|Tablet|PlayBook|Silk|Kindle|SM-T\d|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (chMobile === '?1' || /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function decodePath(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    return pathname;
  }
}

/**
 * Pathname only (no query string or hash), decoded so Hebrew slugs stay
 * readable. Accepts a path or an absolute URL. Null when it isn't a path.
 */
export function sanitizePath(input: string | null | undefined, max = 500): string | null {
  if (!input) return null;
  let pathname: string;
  if (/^https?:\/\//i.test(input)) {
    try {
      pathname = new URL(input).pathname;
    } catch {
      return null;
    }
  } else {
    if (!input.startsWith('/') || input.startsWith('//')) return null;
    pathname = input.split(/[?#]/, 1)[0];
  }
  return decodePath(pathname).slice(0, max) || null;
}

/**
 * Referrer without its query string: just the pathname for our own site,
 * origin + pathname for an external page. Null when empty or unparsable.
 */
export function sanitizeReferrer(input: string | null | undefined, siteOrigin: string, max = 500): string | null {
  if (!input) return null;
  if (input.startsWith('/')) return sanitizePath(input, max);
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const path = decodePath(url.pathname);
    return (url.origin === siteOrigin ? path : `${url.origin}${path}`).slice(0, max);
  } catch {
    return null;
  }
}

/** Keep utm_* / gclid / fbclid string values only (the same rule as lead forms). */
export function cleanUtm(utm: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!utm || typeof utm !== 'object' || Array.isArray(utm)) return out;
  for (const [k, v] of Object.entries(utm as Record<string, unknown>)) {
    if (/^(utm_[a-z]+|gclid|fbclid)$/.test(k) && typeof v === 'string' && v) out[k] = v.slice(0, 200);
  }
  return out;
}

/** Client timestamp if plausible (last 24h, not in the future), else `now`. */
export function clampOccurredAt(ts: unknown, now = Date.now()): string {
  const t = typeof ts === 'number' && Number.isFinite(ts) ? ts : NaN;
  const ok = t >= now - 24 * 60 * 60 * 1000 && t <= now + 60 * 1000;
  return new Date(ok ? Math.min(t, now) : now).toISOString();
}
