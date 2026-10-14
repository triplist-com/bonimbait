/**
 * The dimensions leads are broken down by: stage, region, score band, source.
 * Pure and client-safe.
 *
 * Stages: until the design squad's lib/stages.ts (the owner's 7 stages) is
 * merged, buckets are the member-profile values (profiles.construction_stage,
 * lib/constants/community.ts). A project file's stage (BuildStage ids) maps
 * onto the nearest profile value; "תשתיות" has none, so it keeps its own bucket.
 * TODO(design merge): switch STAGE_BUCKETS to BUILD_STAGES from '@/lib/stages'.
 */
import { CONSTRUCTION_STAGES, REGIONS } from '@/lib/constants/community';
import type { LeadSource, ScoreBandId } from './types';

export const UNKNOWN = 'unknown';

export const STAGE_BUCKETS: ReadonlyArray<{ key: string; label: string }> = [
  ...CONSTRUCTION_STAGES.map((s) => ({ key: s.value as string, label: s.label })),
  { key: 'infrastructure', label: 'תשתיות' },
];

/** Project-file stage ids (lib/stages.ts BuildStage['id']) -> profile stage values. */
const BUILD_STAGE_TO_PROFILE: Record<string, string> = {
  purchase: 'land',
  planning: 'planning',
  permit: 'tender',
  frame: 'frame',
  infrastructure: 'infrastructure',
  finishing: 'finishing',
  'moving-in': 'moving_in',
};

/** Stage bucket key for a profile value or a project-file stage id; null when unknown. */
export function stageKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (STAGE_BUCKETS.some((s) => s.key === value)) return value;
  return BUILD_STAGE_TO_PROFILE[value] ?? null;
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
  { id: 'hot', label: 'חם מאוד (80+)', min: 80 },
  { id: 'warm', label: 'חם (60–79)', min: 60 },
  { id: 'mild', label: 'פושר (40–59)', min: 40 },
  { id: 'cold', label: 'קר (מתחת ל-40)', min: 0 },
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

export function sourceGroupLabel(source: LeadSource): string {
  if (source.medium === 'direct' || source.medium === 'ai_source') return SOURCE_MEDIUM_LABELS[source.medium];
  return `${SOURCE_MEDIUM_LABELS[source.medium]}: ${source.source ?? 'לא ידוע'}`;
}
