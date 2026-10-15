/**
 * Budget planner ("תקציב ראשוני ב-3 דקות") types. Client-safe, no runtime code
 * besides the id lists.
 *
 * The PRICE BOOK holds every number the estimate uses. It is stored in
 * planner_price_book.data (supabase/migrations/20261014124000_growth_planner_price_book.sql),
 * edited at /admin/planner/, and seeded with the owner's 2026 figures
 * (lib/planner/price-book.seed.json). Money is integer agorot, as everywhere in
 * the DB; the engine returns whole shekels.
 */
import type { BuildStage } from '@/lib/stages';

export type StageId = BuildStage['id'];

export const FINISH_LEVEL_IDS = ['basic', 'standard', 'high', 'luxury'] as const;
export type FinishLevelId = (typeof FINISH_LEVEL_IDS)[number];

export const EXTRA_IDS = ['basement', 'pool', 'slope', 'vrf', 'smart_home'] as const;
export type ExtraId = (typeof EXTRA_IDS)[number];

/** 3 means "three floors or more". */
export const FLOOR_OPTIONS = [1, 2, 3] as const;
export type Floors = (typeof FLOOR_OPTIONS)[number];

export type MonthsRange = [number, number];
export type PctRange = [number, number];

export interface PriceBookSource {
  /** Stable id, referenced by notes and warnings (e.g. 'podcast-107'). */
  id: string;
  kind: 'article' | 'podcast';
  title: string;
  /** Publication date, YYYY-MM-DD. */
  date: string;
  /** Site path (or absolute URL). Podcast moments use /video/<id>/?t=<s>. */
  href: string;
  youtubeId?: string;
  /** Second the quoted figure is said (podcasts). */
  startSec?: number;
  /** Short, cleaned quote of the figure (not raw captions). */
  quote?: string;
  /** Shown first, in the result's "sources" line. */
  primary?: boolean;
}

export interface PriceBook {
  version: 1;
  /** The date these numbers are valid for (YYYY-MM-DD): "נכון ל-…". */
  validAsOf: string;
  /** The result is the estimate ±rangePct%. */
  rangePct: number;
  /** VAT rate shown with the "כולל מע״מ" view. All amounts are ex-VAT. */
  vatRatePct: number;
  /** Planning + build cost per architectural m², ex-VAT, by finish level. */
  finishLevels: Record<FinishLevelId, { perM2Agorot: number; note: string }>;
  /** Multiplier per regions.slug (missing = 1). */
  regionFactors: Record<string, number>;
  /** Short note shown when a region is picked (e.g. why it differs). */
  regionNotes: Record<string, string>;
  /** Multiplier on the shell (frame) stage by number of floors. */
  floorShellFactors: Record<'1' | '2' | '3', number>;
  /** Share of planning + build per stage, in %, summing to 100 (0 = outside the estimate). */
  stageSplitPct: Record<StageId, number>;
  /** Optional additions, ex-VAT, added to one stage. */
  extras: Record<ExtraId, { amountAgorot: number; stage: StageId; enabled: boolean; note: string }>;
  /** Moving-in (furniture, appliances): shown next to the total, not in it. */
  movingInPerM2Agorot: { min: number; max: number; note: string };
  /** Contingency (בלת״מים) guidance, % of the total. */
  contingencyPct: { withBudget: PctRange; withoutBudget: PctRange; note: string };
  /** Typical duration per stage, months ([0, 0] = a milestone, not a duration). */
  timelineMonths: Record<StageId, MonthsRange>;
  /** Free-text provenance for the less obvious numbers. */
  notes: { floors: string; split: string; timeline: string; regions: string };
  sources: PriceBookSource[];
}

/** The five questions. */
export interface PlannerInput {
  sizeM2: number;
  floors: Floors;
  /** regions.slug (one of the 13 member regions). */
  regionSlug: string;
  finishLevel: FinishLevelId;
  extras: ExtraId[];
}

/** Whole shekels, rounded for display (ranges, not false precision). */
export interface MoneyRange {
  min: number;
  mid: number;
  max: number;
}

export interface StageEstimate extends MoneyRange {
  id: StageId;
  /** False for stages outside planning + build (purchase, moving-in). */
  included: boolean;
  /** Integer share of the total, in % (included stages sum to 100). */
  sharePct: number;
  /** Extras priced in this stage. */
  extras: ExtraId[];
  months: MonthsRange;
}

export interface PlannerEstimate {
  /** The normalized input the numbers were computed from. */
  input: PlannerInput;
  validAsOf: string;
  rangePct: number;
  vatRatePct: number;
  /** Planning + build (+ extras), ex-VAT. */
  total: MoneyRange;
  totalWithVat: MoneyRange;
  /** total / sizeM2. */
  perM2: MoneyRange;
  /** All 7 stages, in the owner's order. */
  stages: StageEstimate[];
  extras: Array<{ id: ExtraId; amount: number }>;
  /** Furniture and appliances, outside the total. */
  movingIn: MoneyRange;
  contingency: { withBudget: MoneyRange; withoutBudget: MoneyRange };
  /** Planning to keys (the included stages), months. */
  totalMonths: MonthsRange;
  /** Deterministic short id for these inputs + price book date (analytics, the report). */
  estimateId: string;
}

/**
 * bb.planner.last (docs/platform/PROGRAM.md §6): the `plannerEstimate` part of
 * the project file. Whole shekels, ex-VAT.
 */
export interface PlannerSnapshot {
  totalMin: number;
  totalMax: number;
  /** ISO timestamp. */
  at: string;
  inputs: Record<string, unknown>;
}

/** bb.hub.draft (written by the hub squad), as far as the planner reads it. */
export interface HubDraft {
  stage?: StageId;
  regionSlug?: string;
  sizeM2?: number;
  budgetRangeNis?: [number, number];
  targetMoveIn?: string;
}
