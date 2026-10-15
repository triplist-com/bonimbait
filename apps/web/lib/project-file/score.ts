/**
 * Lead scoring: a 0-100 score for a project file, with every point explained
 * in Hebrew, so the consult team knows WHY a lead is hot before calling.
 *
 *   budget        up to 25  bigger builds are worth more to the owner and partners
 *   stage         up to 25  היתר/מכרז and שלד are when builders choose and pay pros
 *   completeness  up to 20  4 points for each of the 5 core facts
 *   intent        up to 30  cost and contractor questions, the planner completed,
 *                           a pro shortlist, repeat visits, saved items
 *
 * Deterministic and pure (unit-tested). The model version is stored with the
 * score, so a later re-weighting can tell old scores apart.
 */
import { classifyQuestion, getTopic, topicCounts } from '@/lib/revenue/topics';
import { budgetMidpoint, countHe, formatNisShort, stageLabel } from './format';
import type { ProjectFile, ProjectScore, ProjectStageId, ScoreBand, ScoreReason, ScoreSignals } from './types';

export const SCORE_MODEL_VERSION = 1 as const;

export const SCORE_WEIGHTS = { budget: 25, stage: 25, completeness: 20, intent: 30 } as const;

/** Budget midpoint (whole shekels) -> points. */
export const BUDGET_STEPS: ReadonlyArray<readonly [minNis: number, points: number]> = [
  [3_000_000, 25],
  [2_000_000, 21],
  [1_500_000, 16],
  [1_000_000, 11],
  [500_000, 6],
  [1, 3],
];

export const STAGE_POINTS: Record<ProjectStageId, { points: number; why: string }> = {
  permit: { points: 25, why: 'בוחרים עכשיו קבלנים וספקים' },
  frame: { points: 25, why: 'השלד בעבודה: ההחלטות הכבדות בתקציב' },
  planning: { points: 18, why: 'זה הזמן לקבע תקציב' },
  infrastructure: { points: 15, why: 'עוד הרבה בחירות לפניהם' },
  finishing: { points: 10, why: 'בוחרים חומרים וספקים' },
  purchase: { points: 10, why: 'בודקים היתכנות לפני רכישה' },
  'moving-in': { points: 3, why: 'לקראת כניסה' },
};

export const INTENT_POINTS = {
  perCostQuestion: 3,
  maxCostQuestions: 9,
  perProQuestion: 3,
  maxProQuestions: 9,
  plannerCompleted: 6,
  perShortlisted: 2,
  maxShortlisted: 6,
  visits2: 2,
  visits3Plus: 4,
  saved3Plus: 2,
} as const;

export const BAND_THRESHOLDS = { hot: 70, warm: 45 } as const;

export const BAND_LABELS: Record<ScoreBand, string> = { hot: 'חם', warm: 'פושר', cool: 'ראשוני' };

const CORE_FACTS: Array<{ has: (f: ProjectFile) => boolean; name: string }> = [
  { has: (f) => Boolean(f.stage), name: 'שלב' },
  { has: (f) => Boolean(f.regionSlug), name: 'אזור' },
  { has: (f) => Boolean(f.sizeM2), name: 'גודל הבית' },
  { has: (f) => Boolean(f.budgetRangeNis), name: 'תקציב' },
  { has: (f) => Boolean(f.targetMoveIn), name: 'מועד כניסה' },
];

export function bandFor(score: number): ScoreBand {
  if (score >= BAND_THRESHOLDS.hot) return 'hot';
  if (score >= BAND_THRESHOLDS.warm) return 'warm';
  return 'cool';
}

export function budgetPoints(nis: number | null | undefined): number {
  if (!nis || nis <= 0) return 0;
  return BUDGET_STEPS.find(([min]) => nis >= min)?.[1] ?? 0;
}

function budgetReason(file: ProjectFile): ScoreReason | null {
  const stated = budgetMidpoint(file.budgetRangeNis);
  if (stated) {
    return { code: 'budget', group: 'budget', label: `תקציב של כ-${formatNisShort(stated)}`, points: budgetPoints(stated) };
  }
  const planned = file.plannerEstimate ? budgetMidpoint([file.plannerEstimate.totalMin, file.plannerEstimate.totalMax]) : null;
  if (planned) {
    return {
      code: 'budget_planner',
      group: 'budget',
      label: `הערכת תקציב במחשבון: כ-${formatNisShort(planned)}`,
      points: budgetPoints(planned),
    };
  }
  return null;
}

function stageReason(file: ProjectFile): ScoreReason | null {
  if (!file.stage) return null;
  const s = STAGE_POINTS[file.stage];
  return { code: 'stage', group: 'stage', label: `שלב ${stageLabel(file.stage)}: ${s.why}`, points: s.points };
}

function completenessReason(file: ProjectFile): ScoreReason | null {
  const have = CORE_FACTS.filter((c) => c.has(file)).length;
  if (have === 0) return null;
  const per = SCORE_WEIGHTS.completeness / CORE_FACTS.length;
  const label = have === CORE_FACTS.length ? 'תיק מלא: 5 מתוך 5 פרטים' : `${have} מתוך 5 פרטים בתיק`;
  return { code: 'completeness', group: 'completeness', label, points: Math.round(have * per) };
}

function intentReasons(file: ProjectFile, signals: ScoreSignals): ScoreReason[] {
  const P = INTENT_POINTS;
  const out: ScoreReason[] = [];
  const questions = (file.questions ?? []).map((x) => x.q);
  const intents = questions.map((q) => classifyQuestion(q));

  const proCount = intents.filter((i) => i.pro).length;
  if (proCount > 0) {
    const top = topicCounts(questions)[0];
    const about = top ? getTopic(top.key)?.label ?? top.label : 'בעלי מקצוע';
    // Count the questions on the leading topic when there is one: that's the actionable signal.
    const shown = top ? top.count : proCount;
    out.push({
      code: 'pro_questions',
      group: 'intent',
      label: `${countHe(shown, 'שאלה אחת', 'שאלות')} על ${about}`,
      points: Math.min(P.maxProQuestions, proCount * P.perProQuestion),
    });
  }
  const costCount = intents.filter((i) => i.cost).length;
  if (costCount > 0) {
    out.push({
      code: 'cost_questions',
      group: 'intent',
      label: `${countHe(costCount, 'שאלה אחת', 'שאלות')} על עלויות`,
      points: Math.min(P.maxCostQuestions, costCount * P.perCostQuestion),
    });
  }
  if (file.plannerEstimate) {
    out.push({ code: 'planner', group: 'intent', label: 'השלימו את מחשבון התקציב', points: P.plannerCompleted });
  }
  const shortlisted = file.shortlistBusinessIds?.length ?? 0;
  if (shortlisted > 0) {
    out.push({
      code: 'shortlist',
      group: 'intent',
      label: `${countHe(shortlisted, 'בעל מקצוע אחד', 'בעלי מקצוע')} ברשימה הקצרה`,
      points: Math.min(P.maxShortlisted, shortlisted * P.perShortlisted),
    });
  }
  const visits = Math.floor(signals.visits ?? 0);
  if (visits >= 3) out.push({ code: 'visits', group: 'intent', label: `חזרו לאתר ${visits} פעמים`, points: P.visits3Plus });
  else if (visits === 2) out.push({ code: 'visits', group: 'intent', label: 'ביקור שני באתר', points: P.visits2 });
  if ((file.savedCount ?? 0) >= 3) {
    out.push({ code: 'saved', group: 'intent', label: `שמרו ${file.savedCount} פריטים`, points: P.saved3Plus });
  }

  // Cap the intent group, trimming the smallest signals first so the shown points add up.
  let budget: number = SCORE_WEIGHTS.intent;
  return out
    .sort((a, b) => b.points - a.points)
    .map((r) => {
      const points = Math.max(0, Math.min(r.points, budget));
      budget -= points;
      return { ...r, points };
    })
    .filter((r) => r.points > 0);
}

/** Score a project file. `signals.visits` comes from the server (distinct sessions). */
export function scoreProjectFile(file: ProjectFile, signals: ScoreSignals = {}): ProjectScore {
  const reasons = [budgetReason(file), stageReason(file), completenessReason(file), ...intentReasons(file, signals)]
    .filter((r): r is ScoreReason => r !== null && r.points > 0)
    .sort((a, b) => b.points - a.points);
  const score = Math.max(0, Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)));
  return {
    version: SCORE_MODEL_VERSION,
    score,
    band: bandFor(score),
    reasons,
    missing: CORE_FACTS.filter((c) => !c.has(file)).map((c) => c.name),
  };
}
