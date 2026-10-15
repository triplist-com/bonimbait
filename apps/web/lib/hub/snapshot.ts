/**
 * "תיק הפרויקט": the hub's part of the project file (PROGRAM.md §6), built
 * from a project, its current budget version and its saved items, plus the
 * completeness meter the builder sees. Pure and client-safe; the server entry
 * point is getMemberProjectSnapshot() in lib/hub/server.ts.
 */
import { projectToDraft } from './onboarding';
import type {
  HubBudgetVersionRow,
  HubDraft,
  HubProjectRow,
  PlannerEstimate,
  ProjectFileSnapshot,
  SavedKind,
} from './types';

export interface SnapshotInput {
  project: Pick<
    HubProjectRow,
    'stage' | 'size_m2' | 'budget_min_agorot' | 'budget_max_agorot' | 'target_move_in'
  > | null;
  regionSlug: string | null;
  currentVersion?: Pick<
    HubBudgetVersionRow,
    'basis' | 'total_min_agorot' | 'total_max_agorot' | 'inputs' | 'created_at'
  > | null;
  saved: ReadonlyArray<{ kind: SavedKind; ref: string }>;
}

/**
 * hub_budget_versions.inputs for a planner-based version:
 * { planner_at, planner_inputs } (see plannerVersionInputs()).
 */
export function plannerVersionInputs(planner: PlannerEstimate): Record<string, unknown> {
  return { planner_at: planner.at, planner_inputs: planner.inputs };
}

/** The planner estimate stored on a version, if its basis is the planner. */
export function plannerEstimateOf(
  version: SnapshotInput['currentVersion'],
): PlannerEstimate | undefined {
  if (!version || version.basis !== 'planner') return undefined;
  if (version.total_min_agorot == null || version.total_max_agorot == null) return undefined;
  const inputs = version.inputs ?? {};
  const plannerInputs = inputs.planner_inputs;
  return {
    totalMin: Math.round(version.total_min_agorot / 100),
    totalMax: Math.round(version.total_max_agorot / 100),
    at: typeof inputs.planner_at === 'string' ? inputs.planner_at : version.created_at,
    inputs:
      plannerInputs && typeof plannerInputs === 'object' && !Array.isArray(plannerInputs)
        ? (plannerInputs as Record<string, unknown>)
        : {},
  };
}

/** The project-file fields the hub owns. Undefined fields are left out. */
export function buildProjectSnapshot(input: SnapshotInput): ProjectFileSnapshot {
  const draft: HubDraft = input.project ? projectToDraft(input.project, input.regionSlug) : {};
  const shortlist = input.saved.filter((s) => s.kind === 'business').map((s) => s.ref);
  const savedCount = input.saved.filter((s) => s.kind !== 'business').length;
  const plannerEstimate = plannerEstimateOf(input.currentVersion);

  const file: ProjectFileSnapshot = { version: 1 };
  if (draft.stage) file.stage = draft.stage;
  if (draft.regionSlug) file.regionSlug = draft.regionSlug;
  if (draft.sizeM2) file.sizeM2 = draft.sizeM2;
  if (draft.budgetRangeNis) file.budgetRangeNis = draft.budgetRangeNis;
  if (draft.targetMoveIn) file.targetMoveIn = draft.targetMoveIn;
  if (plannerEstimate) file.plannerEstimate = plannerEstimate;
  file.savedCount = savedCount;
  file.shortlistBusinessIds = Array.from(new Set(shortlist));
  return file;
}

/** The same snapshot for an anonymous visitor, from localStorage values. */
export function buildLocalSnapshot(
  draft: HubDraft,
  saved: ReadonlyArray<{ kind: SavedKind; ref: string }>,
  shortlistIds: readonly string[],
  planner: PlannerEstimate | null,
): ProjectFileSnapshot {
  const file: ProjectFileSnapshot = { version: 1, ...draft };
  if (planner) file.plannerEstimate = planner;
  file.savedCount = saved.filter((s) => s.kind !== 'business').length;
  file.shortlistBusinessIds = Array.from(
    new Set([...shortlistIds, ...saved.filter((s) => s.kind === 'business').map((s) => s.ref)]),
  );
  return file;
}

export type CompletenessKey =
  | 'stage'
  | 'region'
  | 'size'
  | 'budget'
  | 'moveIn'
  | 'estimate'
  | 'saved'
  | 'shortlist'
  | 'questions';

export interface CompletenessItem {
  key: CompletenessKey;
  label: string;
  done: boolean;
  /** How to fill it, when it's missing. */
  hint: string;
}

export interface Completeness {
  percent: number;
  done: number;
  total: number;
  items: CompletenessItem[];
}

/**
 * How complete the file is that the consult team will see. Each item is
 * something the builder can add in a minute; the hint says how.
 */
export function projectFileCompleteness(
  file: ProjectFileSnapshot,
  extras: { hasEstimate?: boolean; questions?: number } = {},
): Completeness {
  const items: CompletenessItem[] = [
    { key: 'stage', label: 'שלב הבנייה', done: Boolean(file.stage), hint: 'בחרו באיזה שלב אתם' },
    { key: 'region', label: 'אזור הבנייה', done: Boolean(file.regionSlug), hint: 'בחרו את אזור הבנייה' },
    { key: 'size', label: 'גודל הבית', done: Boolean(file.sizeM2), hint: 'הוסיפו כמה מ״ר אתם מתכננים' },
    { key: 'budget', label: 'טווח תקציב', done: Boolean(file.budgetRangeNis), hint: 'הוסיפו טווח תקציב משוער' },
    { key: 'moveIn', label: 'מועד כניסה מתוכנן', done: Boolean(file.targetMoveIn), hint: 'בחרו חודש יעד לכניסה' },
    {
      key: 'estimate',
      label: 'הערכת תקציב',
      done: Boolean(file.plannerEstimate) || Boolean(extras.hasEstimate),
      hint: 'הריצו את מחשבון התקציב',
    },
    { key: 'saved', label: 'תוכן ששמרתם', done: (file.savedCount ?? 0) > 0, hint: 'שמרו סרטון או מאמר שרלוונטי לכם' },
    {
      key: 'shortlist',
      label: 'בעלי מקצוע ברשימה',
      done: (file.shortlistBusinessIds?.length ?? 0) > 0,
      hint: 'הוסיפו בעלי מקצוע לרשימה הקצרה',
    },
    { key: 'questions', label: 'שאלות ששאלתם', done: (extras.questions ?? 0) > 0, hint: 'שאלו שאלה על השלב שלכם' },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), done, total: items.length, items };
}
