/**
 * Pitch access gate for /platform/* (called from middleware.ts; edge-safe).
 *
 * - PITCH_ACCESS_CODE unset: the pages are open.
 * - Set: a visitor opens any /platform URL once with ?code=<code>. The gate
 *   then sets an httpOnly cookie (bb_pitch, 30 days, path /platform) and
 *   redirects to the same URL without the code, so it never lingers in the
 *   address bar, history or a screenshot. Without the cookie, /platform answers
 *   401 with a small Hebrew code form (noindex).
 * The cookie holds a SHA-256 of the code, not the code: changing
 * PITCH_ACCESS_CODE signs everyone out.
 * Two exceptions keep shared links previewable (WhatsApp): OG images under
 * /platform are public, and a link-preview fetcher that brings the right code
 * gets the page itself instead of the cookie redirect it can't follow.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isPlatformPath } from './paths';

export const PITCH_COOKIE = 'bb_pitch';
export const PITCH_CODE_PARAM = 'code';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Link-preview fetchers (WhatsApp, Facebook and iMessage, Telegram, Slack, X,
 * LinkedIn, Discord, Skype). They keep no cookies, so the unlock redirect
 * would land them on the 401 page and the shared link would show no preview.
 */
const PREVIEW_FETCHER = /(WhatsApp|facebookexternalhit|Facebot|TelegramBot|Slackbot|Twitterbot|LinkedInBot|Discordbot|SkypeUriPreview)/i;

export function isPreviewFetcher(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && PREVIEW_FETCHER.test(userAgent));
}

/** Next.js metadata images (opengraph-image, twitter-image): public, so shared links show their preview. */
/** The path as the router will match it: percent-decoded once and lower-cased. */
export function gatePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape: decide on the raw path.
  }
  return path.toLowerCase();
}

export function isMetadataImagePath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return /^(opengraph-image|twitter-image)(-[\w-]+)?$/.test(last);
}

async function tokenFor(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`bonimbait-pitch:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The 401 page: a minimal, dependency-free RTL form that resubmits ?code=. */
function gatePage(request: NextRequest, wrongCode: boolean): NextResponse {
  const action = escapeHtml(request.nextUrl.pathname);
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>גישה להדגמה · בונים בית</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
         font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; background: Canvas; color: CanvasText; }
  main { width: 100%; max-width: 22rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; line-height: 1.6; opacity: .8; }
  label { display: block; font-size: .875rem; margin-bottom: .25rem; }
  input { width: 100%; box-sizing: border-box; font: inherit; padding: .65rem .75rem; border: 1px solid GrayText; border-radius: .6rem; }
  button { margin-top: .75rem; width: 100%; font: inherit; font-weight: 600; padding: .65rem; border-radius: .6rem;
           border: 1px solid ButtonBorder; background: ButtonFace; color: ButtonText; cursor: pointer; }
  input:focus-visible, button:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
  .error { opacity: 1; font-weight: 700; }
</style>
</head>
<body>
<main>
  <h1>הדגמת הפלטפורמה של בונים בית</h1>
  <p>הגישה לעמודים האלה מוגבלת. הזינו את קוד הגישה שקיבלתם.</p>
  ${wrongCode ? '<p class="error" role="alert">⚠ הקוד שגוי. נסו שוב.</p>' : ''}
  <form method="get" action="${action}">
    <label for="code">קוד גישה</label>
    <input id="code" name="${PITCH_CODE_PARAM}" type="password" autocomplete="off" required autofocus>
    <button type="submit">כניסה</button>
  </form>
</main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

/**
 * Returns a response to send (redirect or 401 page), or null to let the
 * request through. Only acts on /platform paths, and only when a code is set.
 */
export async function pitchGate(
  request: NextRequest,
  code: string | undefined = process.env.PITCH_ACCESS_CODE,
): Promise<NextResponse | null> {
  // The router also matches the decoded path ("/%70latform/" renders
  // /platform/), so the gate decides on the decoded, lower-cased one (QA).
  const path = gatePath(request.nextUrl.pathname);
  if (!isPlatformPath(path)) return null;
  const expected = code?.trim();
  if (!expected) return null;
  if (isMetadataImagePath(path)) return null;

  const token = await tokenFor(expected);
  const hasCookie = request.cookies.get(PITCH_COOKIE)?.value === token;
  const supplied = request.nextUrl.searchParams.get(PITCH_CODE_PARAM);

  if (supplied !== null) {
    const ok = (await tokenFor(supplied.trim())) === token;
    if (!ok && !hasCookie) return gatePage(request, true);
    // A preview fetcher that brings the right code reads the page itself (title, OG image).
    if (ok && isPreviewFetcher(request.headers.get('user-agent'))) return null;
    // Strip the code from the URL; set the cookie on a fresh unlock.
    const clean = new URL(request.url);
    clean.searchParams.delete(PITCH_CODE_PARAM);
    const res = NextResponse.redirect(clean, 303);
    res.headers.set('cache-control', 'no-store');
    if (ok) {
      res.cookies.set(PITCH_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/platform',
        maxAge: COOKIE_MAX_AGE,
      });
    }
    return res;
  }

  return hasCookie ? null : gatePage(request, false);
}
