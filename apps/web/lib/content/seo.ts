import type { Metadata } from 'next';
import { SITE_NAME, absoluteUrl } from '@/lib/site';

/**
 * Metadata helpers for migrated content. Yoast titles already carry the brand
 * ("… - בונים בית"), so they are used as absolute titles, bypassing the root
 * layout's "%s | בונים בית" template.
 */

/** Yoast canonical (root-relative, added by the Migration agent) if present. */
export function canonicalPath(row: object, ownPath: string): string {
  const value = (row as { seo_canonical?: string | null }).seo_canonical;
  if (value && value.startsWith('/')) return value;
  return ownPath;
}

export interface ContentMetaInput {
  /** Path of this URL, e.g. "/slug/" (decoded Hebrew is fine). */
  path: string;
  title: string;
  seoTitle?: string | null;
  description?: string | null;
  image?: string | null;
  noindex?: boolean;
  type?: 'article' | 'website' | 'video.other' | 'profile';
  publishedTime?: string | null;
  modifiedTime?: string | null;
  /** Overrides `path` for the canonical (Yoast canonical). */
  canonical?: string;
}

export function buildContentMetadata(input: ContentMetaInput): Metadata {
  const url = absoluteUrl(input.canonical ?? input.path);
  const title = input.seoTitle?.trim() || `${input.title} - ${SITE_NAME}`;
  const description = input.description?.trim() || undefined;
  const images = input.image ? [{ url: input.image, alt: input.title }] : undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: input.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'he_IL',
      type: input.type === 'article' ? 'article' : input.type === 'video.other' ? 'video.other' : 'website',
      images,
      ...(input.type === 'article'
        ? {
            publishedTime: input.publishedTime ?? undefined,
            modifiedTime: input.modifiedTime ?? undefined,
          }
        : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: input.image ? [input.image] : undefined,
    },
  };
}

export interface Crumb {
  label: string;
  href: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: absoluteUrl(c.href),
    })),
  };
}

/** Title for page N of an archive, WordPress style ("… - עמוד 2 מתוך 9"). */
export function pagedTitle(title: string, page: number, totalPages: number): string {
  return page > 1 ? `${title} - עמוד ${page} מתוך ${totalPages}` : title;
}

/** "/blog/" + page 3 -> "/blog/page/3/". */
export function pagedPath(basePath: string, page: number): string {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return page > 1 ? `${base}page/${page}/` : base;
}

const DATE_FORMAT = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jerusalem',
});

export function formatHebrewDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DATE_FORMAT.format(d);
}
