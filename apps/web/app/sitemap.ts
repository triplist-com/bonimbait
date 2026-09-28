import type { MetadataRoute } from 'next';
import { SCENARIOS } from '@/lib/calculator-scenarios';
import { absoluteUrl } from '@/lib/site';
import { getPublicDb, safeQuery } from '@/lib/content/db';
import { listSlugs } from '@/lib/content/queries';
import { listAuthors, listPostCategories, listPublishedPostSlugs } from '@/lib/db/posts';
import { listPublishedPageSlugs } from '@/lib/db/pages';
import { listVideoPageSlugs } from '@/lib/db/videos';

/**
 * One sitemap for every public URL (~1,450 entries, far below the 50,000
 * per-file limit, so no generateSitemaps split: Next 14 would not emit an
 * index for it at /sitemap.xml).
 *
 * DB-backed sections degrade to empty lists if Supabase is unavailable.
 */

export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];
type Freq = NonNullable<Entry['changeFrequency']>;

function entry(path: string, priority: number, changeFrequency: Freq, lastModified?: string | Date | null): Entry {
  return {
    url: absoluteUrl(path),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    changeFrequency,
    priority,
  };
}

/** Fixed routes, including other workstreams' pages that are not `pages` rows. */
const FIXED_ROUTES: Array<[string, number, Freq]> = [
  ['/', 1.0, 'daily'],
  ['/blog/', 0.9, 'daily'],
  ['/search/', 0.8, 'weekly'],
  ['/videos/', 0.7, 'weekly'],
  ['/categories/', 0.6, 'weekly'],
  ['/calculator/', 0.9, 'monthly'],
  // Directory
  ['/recommended/', 0.9, 'daily'],
  ['/join-us/', 0.6, 'monthly'],
  // Community & Commerce
  ['/membership-tiers/', 0.8, 'monthly'],
  ['/הטבות-לקהילה/', 0.7, 'weekly'],
  ['/shop/', 0.6, 'weekly'],
  // Leads
  ['/צור-קשר/', 0.5, 'yearly'],
  ['/הצטרפו-לקבוצות-הווטסאפ/', 0.7, 'monthly'],
  ['/strategic-partners/', 0.5, 'monthly'],
];

/**
 * `pages` rows that must not be indexed: transactional, thank-you, portal and
 * duplicate utility pages (they still render; they're just not listed).
 */
const EXCLUDED_PAGE_SLUGS = new Set([
  'homepage',
  'blog',
  'cart',
  'checkout',
  'thank-you',
  'thank-you-order',
  'thank-you-review',
  'תודה-על-השארת-פרטים',
  'תודה-על-השארת-פרטים-מוצר',
  'partner-portal',
  'partner-portal-2',
  'search-result',
  'strategic-partners/thank-you',
]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed = FIXED_ROUTES.map(([path, priority, freq]) => entry(path, priority, freq, now));
  const seen = new Set(fixed.map((e) => e.url));
  const push = (list: Entry[], e: Entry) => {
    if (seen.has(e.url)) return;
    seen.add(e.url);
    list.push(e);
  };

  const calculators = SCENARIOS.map((s) => entry(`/calculator/${s.slug}/`, 0.8, 'monthly', now));

  // AI-index video categories and YouTube-id video pages (static data).
  const indexed: Entry[] = [];
  try {
    const { getCategories, getVideos } = await import('./api/_lib/data');
    for (const c of getCategories()) indexed.push(entry(`/category/${c.slug}/`, 0.6, 'weekly', now));
    for (const v of getVideos({ limit: 5000 }).videos) {
      indexed.push(entry(`/video/${v.youtube_id}/`, 0.5, 'monthly', v.published_at || null));
    }
  } catch {
    // Static index unavailable: skip.
  }

  const db = getPublicDb();
  const content: Entry[] = [];
  if (db) {
    const [posts, pages, categories, authors, videoPages, businesses, products] = await Promise.all([
      safeQuery(() => listPublishedPostSlugs(db), []),
      safeQuery(() => listPublishedPageSlugs(db), []),
      safeQuery(() => listPostCategories(db), []),
      safeQuery(() => listAuthors(db), []),
      safeQuery(() => listVideoPageSlugs(db), []),
      listSlugs(db, 'businesses'),
      listSlugs(db, 'products'),
    ]);

    for (const p of posts) push(content, entry(`/${p.slug}/`, 0.8, 'monthly', p.updated_at));
    for (const p of pages) {
      if (EXCLUDED_PAGE_SLUGS.has(p.slug.normalize('NFC'))) continue;
      push(content, entry(`/${p.slug}/`, 0.5, 'monthly', p.updated_at));
    }
    for (const c of categories) push(content, entry(`/category/${c.slug}/`, 0.7, 'weekly', c.updated_at));
    for (const a of authors) push(content, entry(`/author/${a.slug}/`, 0.4, 'weekly', a.updated_at));
    for (const v of videoPages) push(content, entry(`/video/${v.legacy_slug}/`, 0.6, 'monthly', v.updated_at));
    for (const b of businesses) push(content, entry(`/business/${b.slug}/`, 0.7, 'weekly', b.updated_at));
    for (const p of products) push(content, entry(`/product/${p.slug}/`, 0.6, 'weekly', p.updated_at));
  }
  // Special pages without a `pages` row fallback.
  push(content, entry('/בונים-בית-tv/', 0.7, 'weekly', now));
  push(content, entry('/אודותינו/', 0.5, 'yearly', now));

  return [...fixed, ...content, ...calculators, ...indexed.filter((e) => !seen.has(e.url))];
}
