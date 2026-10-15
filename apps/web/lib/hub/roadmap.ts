/**
 * The personal roadmap: where the family is on the 7 stages, checklist
 * progress, "מה עושים השבוע" (the next open checklist items of the current
 * stage) and a pace check of the move-in target against typical durations.
 * Pure and client-safe.
 */
import { STAGE_CONTENT, type ChecklistItem } from './content';
import { daysUntilMonth, monthsBetween, remainingMonths } from './onboarding';
import { STAGE_IDS, type StageId } from './types';

export type StageStatus = 'done' | 'current' | 'upcoming';

export function stageIndex(stage: StageId): number {
  return STAGE_IDS.indexOf(stage);
}

export function stageStatus(stage: StageId, current: StageId | null): StageStatus {
  if (!current) return 'upcoming';
  const a = stageIndex(stage);
  const b = stageIndex(current);
  if (a < b) return 'done';
  return a === b ? 'current' : 'upcoming';
}

export function nextStage(stage: StageId): StageId | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGE_IDS.length - 1 ? STAGE_IDS[i + 1] : null;
}

export interface ChecklistProgress {
  done: number;
  total: number;
}

export function checklistProgress(stage: StageId, done: ReadonlySet<string>): ChecklistProgress {
  const items = STAGE_CONTENT[stage].checklist;
  return { done: items.filter((i) => done.has(i.id)).length, total: items.length };
}

/** Share of the whole journey's checklist that's done (0..1). */
export function journeyProgress(done: ReadonlySet<string>): number {
  let total = 0;
  let count = 0;
  for (const id of STAGE_IDS) {
    const p = checklistProgress(id, done);
    total += p.total;
    count += p.done;
  }
  return total ? count / total : 0;
}

export type WeeklyAction = ChecklistItem & { stage: StageId };

/**
 * "מה עושים השבוע": the first `n` open items of the current stage. When the
 * stage is nearly done, the rest come from the next stage, so there are
 * always concrete next steps (none only at the very end of the journey).
 */
export function weeklyActions(current: StageId, done: ReadonlySet<string>, n = 3): WeeklyAction[] {
  const out: WeeklyAction[] = [];
  for (let i = stageIndex(current); i < STAGE_IDS.length && out.length < n; i += 1) {
    const stage = STAGE_IDS[i];
    for (const item of STAGE_CONTENT[stage].checklist) {
      if (out.length >= n) break;
      if (!done.has(item.id)) out.push({ ...item, stage });
    }
  }
  return out;
}

/** True when every item of the current stage is ticked: time to move on. */
export function isStageComplete(stage: StageId, done: ReadonlySet<string>): boolean {
  const p = checklistProgress(stage, done);
  return p.total > 0 && p.done === p.total;
}

export type PaceStatus = 'unknown' | 'past' | 'tight' | 'on-track' | 'roomy';

export interface PaceCheck {
  status: PaceStatus;
  /** Days to the first day of the target month (negative when it passed). */
  daysLeft: number | null;
  monthsLeft: number | null;
  /** Typical months of work left, given the stage and its checklist progress. */
  remaining: { min: number; max: number } | null;
}

/**
 * Is the move-in target realistic? Compares the months left with the typical
 * remaining durations: tight below the minimum, roomy above the maximum.
 */
export function paceCheck(
  stage: StageId | null,
  targetMoveIn: string | null | undefined,
  today: string,
  done: ReadonlySet<string> = new Set(),
): PaceCheck {
  if (!targetMoveIn) return { status: 'unknown', daysLeft: null, monthsLeft: null, remaining: stage ? remainingMonths(stage) : null };
  const daysLeft = daysUntilMonth(targetMoveIn, today);
  const monthsLeft = monthsBetween(today.slice(0, 7), targetMoveIn);
  if (!stage) return { status: 'unknown', daysLeft, monthsLeft, remaining: null };
  const p = checklistProgress(stage, done);
  const remaining = remainingMonths(stage, p.total ? p.done / p.total : 0.5);
  let status: PaceStatus;
  if (daysLeft < 0) status = 'past';
  else if (monthsLeft < remaining.min) status = 'tight';
  else if (monthsLeft > remaining.max) status = 'roomy';
  else status = 'on-track';
  return { status, daysLeft, monthsLeft, remaining };
}
