/**
 * Site-wide noindex for a temporary domain.
 *
 * SITE_NOINDEX=true (set on bonimbait.com until the cutover to bonimbayit.co.il)
 * keeps the whole site out of search results. next.config.mjs sends
 * `X-Robots-Tag: noindex, nofollow` on every response; the robots meta tag
 * follows the same flag so the page never says "index" while the header says
 * "noindex". robots.txt still allows crawling, so search engines can see the
 * noindex and drop pages they already indexed.
 *
 * Server only: SITE_NOINDEX is not a NEXT_PUBLIC_ variable.
 */
import type { Metadata } from 'next';

/** True when the deployment must stay out of search results. */
export function siteNoindex(): boolean {
  return process.env.SITE_NOINDEX === 'true';
}

/** robots metadata for a page that would be indexed on the live domain. */
export function pageRobots(opts: { index?: boolean; follow?: boolean } = {}): NonNullable<Metadata['robots']> {
  if (siteNoindex()) return { index: false, follow: false };
  return { index: opts.index ?? true, follow: opts.follow ?? true };
}
