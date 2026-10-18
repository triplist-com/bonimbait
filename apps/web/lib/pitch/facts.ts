/**
 * Facts the pitch site shows about the owner's business and our platform.
 * Pure and client-safe; the server loader is lib/pitch/data.ts.
 *
 * Rules: every number is computed from our data, measured, or one of the
 * owner's own public facts (with its source). Nothing here is private.
 */
import { PUBLIC_PLAN_PRICES, type PlanPricesNis } from './roi';

/* ------------------------------------------------------------------ */
/* The owner's public price points                                     */
/* ------------------------------------------------------------------ */

export interface PartnerTier {
  id: 'members' | 'partners' | 'ambassadors';
  name: string;
  monthlyNis: number;
}

/** Partner tiers as published on bonimbayit.co.il/strategic-partners/ (October 2026). */
export const PARTNER_TIERS: readonly PartnerTier[] = [
  { id: 'members', name: 'חברים', monthlyNis: 490 },
  { id: 'partners', name: 'שותפים', monthlyNis: 1_490 },
  { id: 'ambassadors', name: 'שגרירים', monthlyNis: 2_990 },
];

export const PRICE_SOURCES = {
  plans: 'bonimbayit.co.il/membership-tiers/',
  partners: 'bonimbayit.co.il/strategic-partners/',
} as const;

export interface PlanPoint {
  slug: string;
  name: string;
  /** Whole shekels, ex-VAT. A range for size-tiered plans (turnkey). */
  minNis: number;
  maxNis: number;
}

/** The service_plans fields this module reads. */
export interface PlanRowLike {
  slug: string;
  name: string;
  sort_order?: number | null;
  prices: Array<{ price_agorot: number }>;
}

const PLAN_SLUGS: Record<keyof PlanPricesNis, string> = {
  budget: 'bonim-budget',
  plus: 'bonim-bait-plus',
  turnkey: 'bonim-bait-turnkey',
};

const FALLBACK_PLANS: readonly PlanPoint[] = [
  { slug: PLAN_SLUGS.budget, name: 'בונים תקציב', minNis: 6_900, maxNis: 6_900 },
  { slug: PLAN_SLUGS.plus, name: 'בונים בית פלוס', minNis: 29_000, maxNis: 29_000 },
  { slug: PLAN_SLUGS.turnkey, name: 'בונים בית עד מפתח', minNis: 133_000, maxNis: 149_000 },
];

/** The plan ladder from the service_plans table, or the public prices when it can't be read. */
export function planPoints(rows: readonly PlanRowLike[]): PlanPoint[] {
  const points = [...rows]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .flatMap((row) => {
      const values = row.prices.map((p) => Math.round(p.price_agorot / 100)).filter((v) => v > 0);
      if (!values.length) return [];
      return [{ slug: row.slug, name: row.name, minNis: Math.min(...values), maxNis: Math.max(...values) }];
    });
  return points.length ? points : [...FALLBACK_PLANS];
}

/** Prices for the ROI model: turnkey at the midpoint of its size tiers. */
export function roiPrices(points: readonly PlanPoint[]): PlanPricesNis {
  const mid = (key: keyof PlanPricesNis) => {
    const p = points.find((x) => x.slug === PLAN_SLUGS[key]);
    return p ? (p.minNis + p.maxNis) / 2 : PUBLIC_PLAN_PRICES[key];
  };
  return { budget: mid('budget'), plus: mid('plus'), turnkey: mid('turnkey') };
}

/* ------------------------------------------------------------------ */
/* The video library behind the answers                                */
/* ------------------------------------------------------------------ */

export interface LibraryStats {
  /** Every video in the catalog (the advisor knows it by title and chapters). */
  catalog: number;
  catalogHours: number;
  /** Videos with a full transcript: an answer can jump to the exact second. */
  transcribed: number;
  transcribedHours: number;
  /** In the catalog without a transcript yet (title and chapters only). */
  titleOnly: number;
}

type CatalogVideo = {
  duration_seconds?: number | string | null;
  segment_count?: number | string | null;
  has_transcript?: boolean | string | null;
};

const truthy = (v: unknown) => v === true || v === 'True' || v === 'true' || v === 1 || v === '1';

export function computeLibraryStats(videos: readonly CatalogVideo[]): LibraryStats {
  let transcribed = 0;
  let transcribedSeconds = 0;
  let catalogSeconds = 0;
  for (const v of videos) {
    const seconds = Number(v.duration_seconds ?? 0);
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    catalogSeconds += safe;
    if (Number(v.segment_count ?? 0) > 0 || truthy(v.has_transcript)) {
      transcribed += 1;
      transcribedSeconds += safe;
    }
  }
  return {
    catalog: videos.length,
    catalogHours: Math.round(catalogSeconds / 3600),
    transcribed,
    transcribedHours: Math.round(transcribedSeconds / 3600),
    titleOnly: videos.length - transcribed,
  };
}

/** Share of the catalog with full transcripts, as a whole percent. */
export function transcribedShare(stats: LibraryStats): number {
  return stats.catalog > 0 ? Math.round((stats.transcribed / stats.catalog) * 100) : 0;
}

/**
 * The owner's one action that may turn the rest of the channel into answers
 * at no transcription cost. Confidence as stated by the knowledge squad
 * (docs/SEARCH_COVERAGE.md, 2026-10-14): every uncaptioned video has no video
 * language set, every auto-captioned one is set to Hebrew; so the fix is
 * "probably free". Update the wording here if the coverage doc revises it.
 */
export const LANGUAGE_ACTION = {
  title: 'צעד אחד שלכם: ״שפת הסרטון: עברית״',
  how: 'ב-YouTube Studio, בעריכה מרוכזת של כל הסרטונים.',
  why: 'לכל הסרטונים בלי כתוביות לא מוגדרת שפה, ולכל אלה עם כתוביות אוטומטיות מוגדרת עברית.',
  outcome: 'אחרי ההגדרה יוטיוב אמור לייצר כתוביות אוטומטיות, והטייס האוטומטי יכניס אותם לתשובות בלי עלות תמלול.',
  confidence: 'סביר מאוד, לא מובטח: זו מסקנה מהנתונים, עוד לא ניסוי.',
} as const;

/* ------------------------------------------------------------------ */
/* Committed measurements (apps/web/data/pitch/*.json)                 */
/* ------------------------------------------------------------------ */

export interface ParityFacts {
  source: string;
  /** ISO date (Israel) the parity report was produced. */
  checkedAt: string;
  total: number;
  passed: number;
  byType: Record<string, number>;
  byResult: Record<string, number>;
  acceptedExceptions: number;
}

export interface ChannelFacts {
  source: string;
  inventoriedAt: string;
  /** Every upload in the channel's tabs and playlists, shorts included. */
  total: number;
  hours: number;
  byType: Record<string, { count: number; hours: number }>;
  answerableScope: number;
  podcastLatestEpisode: number;
  playlists: number;
}

export interface MigrationFacts {
  source: string;
  loadedAt: string;
  /** Rows loaded per content type: posts, video_pages, businesses, reviews, … */
  counts: Record<string, number>;
}

export interface PitchFactsFile {
  generatedAt: string;
  parity: ParityFacts;
  channel: ChannelFacts;
  migration: MigrationFacts;
}

export type SpeedMethod = 'simulate' | 'devtools';

export interface SpeedSite {
  label: string;
  url: string;
  /** Median of the runs, per throttling method. */
  lcpMs: Record<SpeedMethod, number>;
  performance: Record<SpeedMethod, number>;
  bytes: number;
  requests: number;
}

export interface SpeedFile {
  measuredAt: string;
  tool: string;
  formFactor: 'mobile';
  runs: number;
  statistic: 'median';
  old: SpeedSite;
  new: SpeedSite;
}

/** Hebrew labels for the parity report's page types. */
export const PARITY_TYPE_LABELS: Record<string, string> = {
  post: 'מאמרים',
  video: 'עמודי וידאו',
  business: 'בעלי מקצוע',
  page: 'עמודים',
  category: 'קטגוריות',
  category_product: 'קטגוריות חנות',
  product: 'מוצרים',
  author: 'כותבים',
  product_cat: 'חנות',
  service: 'שירותים',
};

/** Page types by URL count: the four largest, then the rest folded into "אחר". */
export function parityRows(byType: Record<string, number>, keep = 4): Array<{ key: string; label: string; value: number }> {
  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const rows = sorted.slice(0, keep).map(([key, value]) => ({ key, label: PARITY_TYPE_LABELS[key] ?? key, value }));
  const rest = sorted.slice(keep).reduce((sum, [, v]) => sum + v, 0);
  if (rest > 0) rows.push({ key: 'other', label: 'אחר', value: rest });
  return rows;
}

/** "כמעט 1,000" for 950–999, "יותר מ-1,200" from 1,000 up, otherwise the number itself. */
export function libraryPhrase(total: number): string {
  if (total >= 950 && total < 1_000) return 'כמעט 1,000';
  if (total >= 1_000) return `יותר מ-${(Math.floor(total / 100) * 100).toLocaleString('he-IL')}`;
  return total.toLocaleString('he-IL');
}

/** "5.3" for 5349 ms. */
export function secondsLabel(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1);
}

/** How many times faster the new LCP is, to one decimal ("2.8"). */
export function speedup(oldMs: number, newMs: number): string {
  if (!(oldMs > 0 && newMs > 0)) return '1.0';
  return (Math.round((oldMs / newMs) * 10) / 10).toFixed(1);
}

/**
 * Content Autopilot, measured by the autopilot squad on three channel videos
 * (docs/platform/AUTOPILOT.md §3, 2026-10-14): AI cost per video and the time
 * to process one 15-minute video locally.
 */
export const AUTOPILOT_MEASURED = {
  costPerVideoUsd: 0.002,
  processSeconds: 15,
  measuredAt: '2026-10-14',
} as const;

/** "29.9.2026" from "2026-09-29". */
export function hebrewShortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
