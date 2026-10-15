/**
 * Onboarding ("מיפוי מצב"): the 5 questions, their options, and the mapping
 * between the anonymous draft (`bb.hub.draft`), a hub_projects row and the
 * member profile. Pure and client-safe: the browser and the server run the
 * same validation (the server re-validates everything it receives).
 *
 * Band ids match hub_staff_aggregates() in
 * supabase/migrations/20261014121200_hub_aggregates.sql.
 */
import type { ConstructionStage } from '@/lib/db/types';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { BUILD_STAGES } from '@/lib/stages';
import { STAGE_CONTENT } from './content';
import { isolateLtr } from './format';
import { STAGE_IDS, isStageId, type HubDraft, type HubProjectRow, type StageId } from './types';

export const ONBOARDING_STEPS = ['stage', 'region', 'size', 'budget', 'moveIn'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface SizeOption {
  id: string;
  label: string;
  /** Representative m² stored when the option is picked. */
  value: number;
}

/** House size chips; the band ids are the SIZE_BANDS ids. Ranges are LTR-isolated (no "200–150" in RTL). */
export const SIZE_OPTIONS: readonly SizeOption[] = [
  { id: 'lt-150', label: 'עד 150 מ״ר', value: 140 },
  { id: '150-200', label: `${isolateLtr('150–200')} מ״ר`, value: 180 },
  { id: '200-250', label: `${isolateLtr('200–250')} מ״ר`, value: 220 },
  { id: '250-300', label: `${isolateLtr('250–300')} מ״ר`, value: 270 },
  { id: '300-plus', label: 'מעל 300 מ״ר', value: 330 },
];

export const SIZE_MIN = 30;
export const SIZE_MAX = 2000;

export interface BudgetBand {
  id: string;
  label: string;
  /** Whole shekels, [min, max]. */
  range: [number, number];
}

/** Budget chips (whole shekels). The aggregates bucket a range by its midpoint. */
export const BUDGET_BANDS: readonly BudgetBand[] = [
  { id: 'lt-1.5m', label: `עד ${isolateLtr('1.5')} מיליון ₪`, range: [0, 1_500_000] },
  { id: '1.5-2m', label: `${isolateLtr('1.5–2')} מיליון ₪`, range: [1_500_000, 2_000_000] },
  { id: '2-2.5m', label: `${isolateLtr('2–2.5')} מיליון ₪`, range: [2_000_000, 2_500_000] },
  { id: '2.5-3m', label: `${isolateLtr('2.5–3')} מיליון ₪`, range: [2_500_000, 3_000_000] },
  { id: '3-4m', label: `${isolateLtr('3–4')} מיליון ₪`, range: [3_000_000, 4_000_000] },
  { id: '4m-plus', label: `מעל ${isolateLtr('4')} מיליון ₪`, range: [4_000_000, 6_000_000] },
];

export const BUDGET_MAX_NIS = 1_000_000_000;

/** Band id of a budget range by its midpoint (same rule as the SQL aggregates). */
export function budgetBandId(range: [number, number] | null | undefined): string {
  if (!range) return 'unknown';
  const mid = (range[0] + range[1]) / 2;
  if (mid < 1_500_000) return 'lt-1.5m';
  if (mid < 2_000_000) return '1.5-2m';
  if (mid < 2_500_000) return '2-2.5m';
  if (mid < 3_000_000) return '2.5-3m';
  if (mid < 4_000_000) return '3-4m';
  return '4m-plus';
}

/** Size band id (same rule as the SQL aggregates). */
export function sizeBandId(sizeM2: number | null | undefined): string {
  if (sizeM2 == null) return 'unknown';
  if (sizeM2 < 150) return 'lt-150';
  if (sizeM2 < 200) return '150-200';
  if (sizeM2 < 250) return '200-250';
  if (sizeM2 < 300) return '250-300';
  return '300-plus';
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isIsoMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = MONTH_RE.exec(value);
  return Boolean(m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100);
}

const MEMBER_REGION_SLUGS = new Set(MEMBER_REGIONS.map((r) => r.slug));

export function isMemberRegionSlug(value: unknown): value is string {
  return typeof value === 'string' && MEMBER_REGION_SLUGS.has(value);
}

function toInt(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Keep only valid answers, in the exact `bb.hub.draft` shape. Never throws:
 * anything malformed is dropped (a stale or hand-edited localStorage value
 * must not break the page).
 */
export function normalizeDraft(input: unknown): HubDraft {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const draft: HubDraft = {};

  if (isStageId(raw.stage)) draft.stage = raw.stage;
  if (isMemberRegionSlug(raw.regionSlug)) draft.regionSlug = raw.regionSlug;

  const size = toInt(raw.sizeM2);
  if (size != null && size >= SIZE_MIN && size <= SIZE_MAX) draft.sizeM2 = size;

  if (Array.isArray(raw.budgetRangeNis) && raw.budgetRangeNis.length === 2) {
    const lo = toInt(raw.budgetRangeNis[0]);
    const hi = toInt(raw.budgetRangeNis[1]);
    if (lo != null && hi != null && lo >= 0 && hi > 0 && lo <= hi && hi <= BUDGET_MAX_NIS) {
      draft.budgetRangeNis = [lo, hi];
    }
  }

  if (isIsoMonth(raw.targetMoveIn)) draft.targetMoveIn = raw.targetMoveIn;
  return draft;
}

/** Enough to draw the personal roadmap: stage, region and size. */
export function isDraftComplete(draft: HubDraft): boolean {
  return Boolean(draft.stage && draft.regionSlug && draft.sizeM2);
}

/** The first step still missing an answer, or null when all 5 are answered. */
export function firstOpenStep(draft: HubDraft): OnboardingStep | null {
  if (!draft.stage) return 'stage';
  if (!draft.regionSlug) return 'region';
  if (!draft.sizeM2) return 'size';
  return null;
}

// ---------------------------------------------------------------------------
// Dates (calendar arithmetic on YYYY-MM-DD / YYYY-MM strings, in UTC)
// ---------------------------------------------------------------------------

/** Today's date in Israel (YYYY-MM-DD). */
export function israelToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/** 'YYYY-MM' plus n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + Math.round(n);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Whole months from `fromMonth` to `toMonth` (negative when in the past). */
export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [y1, m1] = fromMonth.split('-').map(Number);
  const [y2, m2] = toMonth.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Days from `today` (YYYY-MM-DD) to the first day of `month` (YYYY-MM). */
export function daysUntilMonth(month: string, today: string): number {
  const target = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const from = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  return Math.round((target - from) / 86_400_000);
}

/** Typical months of work left from the start of `stage` (inclusive) to the keys. */
export function remainingMonths(stage: StageId, progressInStage = 0.5): { min: number; max: number } {
  const from = STAGE_IDS.indexOf(stage);
  let min = 0;
  let max = 0;
  STAGE_IDS.forEach((id, i) => {
    if (i < from) return;
    const share = i === from ? 1 - Math.min(1, Math.max(0, progressInStage)) : 1;
    min += STAGE_CONTENT[id].duration.minMonths * share;
    max += STAGE_CONTENT[id].duration.maxMonths * share;
  });
  return { min: Math.round(min), max: Math.round(max) };
}

/**
 * A realistic move-in month for a family in `stage` today: the midpoint of
 * the typical remaining durations, assuming they're halfway through it.
 */
export function suggestMoveIn(stage: StageId, today: string): string {
  const { min, max } = remainingMonths(stage);
  return addMonths(today.slice(0, 7), Math.max(1, Math.round((min + max) / 2)));
}

// ---------------------------------------------------------------------------
// Draft <-> project row <-> profile
// ---------------------------------------------------------------------------

/** hub_projects columns for a draft (agorot, first-of-month date). */
export function draftToProjectFields(
  draft: HubDraft,
  regionId: string | null,
): Pick<
  HubProjectRow,
  'stage' | 'region_id' | 'size_m2' | 'budget_min_agorot' | 'budget_max_agorot' | 'target_move_in'
> {
  return {
    stage: draft.stage ?? null,
    region_id: regionId,
    size_m2: draft.sizeM2 ?? null,
    budget_min_agorot: draft.budgetRangeNis ? draft.budgetRangeNis[0] * 100 : null,
    budget_max_agorot: draft.budgetRangeNis ? draft.budgetRangeNis[1] * 100 : null,
    target_move_in: draft.targetMoveIn ? `${draft.targetMoveIn}-01` : null,
  };
}

/** The draft view of a project row (the inverse of draftToProjectFields). */
export function projectToDraft(
  row: Pick<
    HubProjectRow,
    'stage' | 'size_m2' | 'budget_min_agorot' | 'budget_max_agorot' | 'target_move_in'
  >,
  regionSlug: string | null,
): HubDraft {
  return normalizeDraft({
    stage: row.stage ?? undefined,
    regionSlug: regionSlug ?? undefined,
    sizeM2: row.size_m2 ?? undefined,
    budgetRangeNis:
      row.budget_min_agorot != null && row.budget_max_agorot != null
        ? [Math.round(row.budget_min_agorot / 100), Math.round(row.budget_max_agorot / 100)]
        : undefined,
    targetMoveIn: row.target_move_in ? row.target_move_in.slice(0, 7) : undefined,
  });
}

/**
 * profiles.construction_stage for a hub stage. The profile enum (the live
 * signup form) is coarser: infrastructure counts as the frame stage there.
 */
export function profileStageFor(stage: StageId): ConstructionStage {
  if (stage === 'infrastructure') return 'frame';
  const mapped = BUILD_STAGES.find((s) => s.id === stage)?.profileStage;
  if (!mapped) throw new Error(`No profile stage for ${stage}`);
  return mapped;
}

/** Hub stage for a profile stage (prefills onboarding for members). */
export function stageFromProfile(value: ConstructionStage | null | undefined): StageId | undefined {
  if (!value) return undefined;
  if (value === 'design') return 'finishing';
  return BUILD_STAGES.find((s) => s.profileStage === value)?.id;
}

/** "הבית של משפחת לוי" from a member's full name; "הבית שלכם" without one. */
export function defaultProjectTitle(fullName: string | null | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `הבית של משפחת ${words.slice(1).join(' ')}`.slice(0, 80);
  if (words.length === 1) return `הבית של ${words[0]}`.slice(0, 80);
  return 'הבית שלכם';
}

/** Analytics props for hub_onboarding_completed (no personal data). */
export function onboardingEventProps(draft: HubDraft, today: string) {
  return {
    stage: draft.stage,
    region: draft.regionSlug,
    size_sqm: draft.sizeM2,
    budget_band: draft.budgetRangeNis ? budgetBandId(draft.budgetRangeNis) : undefined,
    timeline_months: draft.targetMoveIn
      ? Math.max(0, monthsBetween(today.slice(0, 7), draft.targetMoveIn))
      : undefined,
  };
}
