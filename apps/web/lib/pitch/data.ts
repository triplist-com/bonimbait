import 'server-only';

/**
 * Server data for the pitch site (/platform/ and /platform/tour/). Every
 * number is computed when the page renders (ISR) from our own data:
 * - the video catalog and answer index (apps/web/data/videos.json);
 * - live counts from the database (published articles and pros);
 * - the owner's plan prices from service_plans;
 * - committed measurements in apps/web/data/pitch/ (URL parity, channel
 *   inventory, migration load, old vs new speed).
 * Loaders degrade to the committed facts when the database can't be read.
 */
import { cache } from 'react';
import { getVideos, type VideoRecord } from '@/app/api/_lib/data';
import { getPublicDb, safeQuery } from '@/lib/content/db';
import { listActiveServicePlans } from '@/lib/db/commerce';
import factsJson from '@/data/pitch/facts.json';
import speedJson from '@/data/pitch/speed.json';
import {
  computeLibraryStats,
  planPoints,
  roiPrices,
  type LibraryStats,
  type PitchFactsFile,
  type PlanPoint,
  type SpeedFile,
} from './facts';
import type { PlanPricesNis } from './roi';

export const PITCH_FACTS = factsJson as PitchFactsFile;
export const PITCH_SPEED = speedJson as SpeedFile;

function allCatalogVideos(): VideoRecord[] {
  try {
    const first = getVideos({ page: 1, limit: 100 });
    const out = [...first.videos];
    for (let page = 2; page <= first.pages; page++) out.push(...getVideos({ page, limit: 100 }).videos);
    return out;
  } catch {
    return [];
  }
}

async function countByStatus(table: 'posts' | 'businesses' | 'reviews', status: 'published' | 'approved'): Promise<number | null> {
  const db = getPublicDb();
  if (!db) return null;
  return safeQuery(async () => {
    const { count, error } = await db.from(table).select('id', { count: 'exact', head: true }).eq('status', status);
    if (error) throw new Error(error.message);
    return count ?? null;
  }, null);
}

export interface PitchData {
  library: LibraryStats;
  /** Published articles, pros and approved reviews right now (falls back to what the migration loaded). */
  articles: number;
  pros: number;
  reviews: number;
  plans: PlanPoint[];
  prices: PlanPricesNis;
  facts: PitchFactsFile;
  speed: SpeedFile;
}

export const getPitchData = cache(async (): Promise<PitchData> => {
  const db = getPublicDb();
  const [posts, businesses, reviews, planRows] = await Promise.all([
    countByStatus('posts', 'published'),
    countByStatus('businesses', 'published'),
    countByStatus('reviews', 'approved'),
    db ? safeQuery(() => listActiveServicePlans(db), []) : Promise.resolve([]),
  ]);
  const plans = planPoints(planRows);
  const loaded = PITCH_FACTS.migration.counts;
  return {
    library: computeLibraryStats(allCatalogVideos()),
    articles: posts || loaded.posts || 0,
    pros: businesses || loaded.businesses || 0,
    reviews: reviews || loaded.reviews || 0,
    plans,
    prices: roiPrices(plans),
    facts: PITCH_FACTS,
    speed: PITCH_SPEED,
  };
});
