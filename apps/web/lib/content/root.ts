import 'server-only';

import { cache } from 'react';
import type { PageRow, PostRow } from '@/lib/db/types';
import { getPublishedPostBySlug } from '@/lib/db/posts';
import { getPublishedPageBySlug } from '@/lib/db/pages';
import { getPublicDb } from './db';

export type RootResolution = { type: 'post'; post: PostRow } | { type: 'page'; page: PageRow } | null;

/**
 * Resolve a root-level "/<slug>/" to a post or a `pages` row, in that order
 * (special pages are checked by the caller first). `slug` must be decoded and
 * NFC-normalized. Memoized per request so generateMetadata and the page share
 * the queries.
 */
export const resolveRootContent = cache(async (slug: string): Promise<RootResolution> => {
  const db = getPublicDb();
  if (!db) return null;
  const post = await getPublishedPostBySlug(db, slug);
  if (post) return { type: 'post', post };
  const page = await getPublishedPageBySlug(db, slug);
  if (page) return { type: 'page', page };
  return null;
});
