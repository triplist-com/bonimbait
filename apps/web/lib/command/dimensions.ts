/**
 * The dimensions leads are broken down by: stage, region, score band, source.
 * Pure and client-safe.
 *
 * Stages are the owner's 7 (lib/stages.ts): רכישה · תכנון · היתר/מכרז · שלד ·
 * תשתיות · גמרים · אכלוס. A project file names one by id; an older lead or a
 * member profile has a profiles.construction_stage value, mapped through
 * stageForProfile(). Profile values with no stage of their own ("עיצוב",
 * "שיפוץ") count as "אחר".
 */
import { CONSTRUCTION_STAGES, REGIONS } from '@/lib/constants/community';
import type { ConstructionStage } from '@/lib/db/types';
import { BUILD_STAGES, stageForProfile } from '@/lib/stages';
import type { LeadSource, ScoreBandId } from './types';

export const UNKNOWN = 'unknown';
export const OTHER_STAGE = 'other';

export const STAGE_BUCKETS: ReadonlyArray<{ key: string; label: string }> = [
  ...BUILD_STAGES.map((s) => ({ key: s.id as string, label: s.label })),
  { key: OTHER_STAGE, label: 'אחר' },
];

/** Stage bucket key for a project-file stage id or a profile value; null when not given. */
export function stageKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (BUILD_STAGES.some((s) => s.id === value)) return value;
  if (CONSTRUCTION_STAGES.some((s) => s.value === value)) {
    return stageForProfile(value as ConstructionStage)?.id ?? OTHER_STAGE;
  }
  return null;
}

export function stageLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return STAGE_BUCKETS.find((s) => s.key === key)?.label ?? null;
}

/** The 14 canonical regions (13 member regions + nationwide). */
export const REGION_BUCKETS: ReadonlyArray<{ key: string; label: string }> = REGIONS.map((r) => ({ key: r.slug, label: r.name }));

export function regionLabel(slug: string | null | undefined, names?: Record<string, string>): string | null {
  if (!slug) return null;
  return names?.[slug] ?? REGIONS.find((r) => r.slug === slug)?.name ?? null;
}

// ---------------------------------------------------------------------------
// Score bands (the revenue squad scores 0-100)
// ---------------------------------------------------------------------------

export const SCORE_BANDS: ReadonlyArray<{ id: ScoreBandId; label: string; min: number | null }> = [
  { id: 'hot', label: 'חם מאוד: 80 ומעלה', min: 80 },
  { id: 'warm', label: 'חם: 60 עד 79', min: 60 },
  { id: 'mild', label: 'פושר: 40 עד 59', min: 40 },
  { id: 'cold', label: 'קר: מתחת ל-40', min: 0 },
  { id: 'none', label: 'ללא ציון', min: null },
];

/** A lead is "hot" (worth a call today) from this score. */
export const HOT_SCORE = 70;

export function scoreBand(score: number | null | undefined): ScoreBandId {
  if (score == null || !Number.isFinite(score)) return 'none';
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 40) return 'mild';
  return 'cold';
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export const SOURCE_MEDIUM_LABELS: Record<LeadSource['medium'], string> = {
  partner: 'שותף',
  ai_source: 'תוכן בתשובה',
  campaign: 'קמפיין',
  referral: 'הפניה מאתר',
  direct: 'ישיר',
};

/** Grouping key for "by source" breakdowns: medium plus a source when it says something. */
export function sourceGroupKey(source: LeadSource): string {
  if (source.medium === 'direct') return 'direct';
  if (source.medium === 'ai_source') return 'ai_source';
  return `${source.medium}:${source.source ?? UNKNOWN}`;
}

export function sourceGroupLabel(source: LeadSource, partnerNames?: ReadonlyMap<string, string>): string {
  if (source.medium === 'direct' || source.medium === 'ai_source') return SOURCE_MEDIUM_LABELS[source.medium];
  const name = source.medium === 'partner' && source.source ? partnerNames?.get(source.source) : undefined;
  return `${SOURCE_MEDIUM_LABELS[source.medium]}: ${name ?? source.source ?? 'לא ידוע'}`;
}
