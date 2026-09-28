import 'server-only';

import { revalidatePath } from 'next/cache';
import { publicPath, type ContentKind } from './slug';

/**
 * ISR invalidation after admin writes, so public pages update immediately
 * instead of after their `revalidate` window (1h for content).
 *
 * Hebrew slugs are revalidated in both decoded and percent-encoded form: the
 * cache key follows the request URL, which browsers send encoded.
 */
function pathVariants(path: string): string[] {
  const out = new Set<string>([path, path.replace(/\/$/, '') || '/']);
  const encoded = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  out.add(encoded);
  out.add(encoded.replace(/\/$/, '') || '/');
  return Array.from(out);
}

function paths(list: string[]): void {
  for (const p of list) for (const v of pathVariants(p)) revalidatePath(v);
}

function routes(list: string[]): void {
  for (const r of list) revalidatePath(r, 'page');
}

const SITEMAP = ['/sitemap.xml'];

/** A post and every listing it can appear in. */
export function revalidatePost(slugs: Array<string | null | undefined>): void {
  paths([...slugs.filter((s): s is string => !!s).map((s) => publicPath('post', s)), '/', '/blog/', ...SITEMAP]);
  routes(['/[slug]', '/blog/page/[n]', '/category/[slug]', '/category/[slug]/page/[n]', '/author/[slug]', '/author/[slug]/page/[n]']);
}

export function revalidatePage(slugs: Array<string | null | undefined>): void {
  paths([...slugs.filter((s): s is string => !!s).map((s) => publicPath('page', s)), ...SITEMAP]);
  routes(['/[slug]']);
}

export function revalidateVideoPage(slugs: Array<string | null | undefined>): void {
  paths([...slugs.filter((s): s is string => !!s).map((s) => publicPath('video', s)), '/videos/', '/בונים-בית-tv/', ...SITEMAP]);
  routes(['/video/[id]']);
}

export function revalidateBusiness(slugs: Array<string | null | undefined>): void {
  paths([...slugs.filter((s): s is string => !!s).map((s) => publicPath('business', s)), '/recommended/', '/', ...SITEMAP]);
  routes(['/business/[slug]']);
}

export function revalidateDirectory(): void {
  paths(['/recommended/', '/join-us/', '/']);
  routes(['/business/[slug]']);
}

export function revalidateCommerce(productSlugs: Array<string | null | undefined> = []): void {
  paths([
    ...productSlugs.filter((s): s is string => !!s).map((s) => publicPath('product', s)),
    '/shop/',
    '/הטבות-לקהילה/',
    '/membership-tiers/',
    '/',
    ...SITEMAP,
  ]);
  routes(['/product/[slug]', '/product-category/[slug]', '/category-product/[slug]']);
}

export function revalidateTaxonomy(): void {
  paths(['/', '/blog/', ...SITEMAP]);
  routes(['/category/[slug]', '/category/[slug]/page/[n]', '/[slug]']);
}

export { publicPath, type ContentKind };
