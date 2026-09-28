import type { Metadata } from 'next';
import { SITE_NAME, absoluteUrl } from '@/lib/site';

/** Decode a (possibly percent-encoded) Hebrew route param and NFC-normalize it. */
export function decodeSlug(param: string): string {
  let value = param;
  try {
    value = decodeURIComponent(param);
  } catch {
    // Malformed escape: use as-is.
  }
  return value.normalize('NFC');
}

/**
 * Page metadata with the live Yoast title verbatim ("<title> - בונים בית"),
 * bypassing the root layout's "%s | בונים בית" template, and a canonical URL
 * built from lib/site.
 */
export function commerceMetadata(opts: {
  /** Full Yoast title, e.g. "סל קניות - בונים בית". */
  title: string;
  description?: string | null;
  path: string;
  image?: string | null;
  noindex?: boolean;
  nofollow?: boolean;
}): Metadata {
  const canonical = absoluteUrl(opts.path);
  const description = opts.description ?? undefined;
  return {
    title: { absolute: opts.title },
    description,
    alternates: { canonical },
    robots: { index: !opts.noindex, follow: !opts.nofollow },
    openGraph: {
      title: opts.title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'he_IL',
      type: 'website',
      ...(opts.image ? { images: [{ url: opts.image }] } : {}),
    },
  };
}

/** Strip tags for meta descriptions / card excerpts. */
export function htmlToText(html: string | null | undefined, maxLength?: number): string {
  const text = (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}
