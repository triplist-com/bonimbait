import { describe, expect, it } from 'vitest';
import {
  BAND_THRESHOLDS,
  BUDGET_STEPS,
  SCORE_WEIGHTS,
  bandFor,
  budgetPoints,
  scoreProjectFile,
} from '@/lib/project-file/score';
import { sanitizeProjectFile } from '@/lib/project-file/sanitize';
import type { ProjectFile } from '@/lib/project-file/types';

const at = (d: number) => new Date(Date.UTC(2026, 9, d, 9)).toISOString();

/** The consult-queue demo's top lead: permit, Sharon, 220 m², ~₪2.6M, 4 aluminium questions. */
const TOP_LEAD_FILE: ProjectFile = sanitizeProjectFile({
  stage: 'permit',
  regionSlug: 'sharon',
  sizeM2: 220,
  budgetRangeNis: [2_400_000, 2_800_000],
  targetMoveIn: '2028-03',
  questions: [
    { q: 'איזה פרופיל אלומיניום מתאים לבית ליד הים?', at: at(9) },
    { q: 'חלונות עם תרמי-ברייק: באמת שווה את זה?', at: at(10) },
    { q: 'כמה עולים חלונות אלומיניום לבית של 220 מ״ר?', at: at(11) },
    { q: 'האם כדאי תריסים חשמליים בכל החלונות?', at: at(12) },
  ],
});

describe('scoreProjectFile', () => {
  it('scores the demo top lead 82 with readable reasons', () => {
    const s = scoreProjectFile(TOP_LEAD_FILE, { visits: 3 });
    expect(s.score).toBe(82);
    expect(s.band).toBe('hot');
    expect(s.missing).toEqual([]);
    expect(s.reasons.map((r) => [r.code, r.points])).toEqual([
      ['stage', 25],
      ['budget', 21],
      ['completeness', 20],
      ['pro_questions', 9],
      ['visits', 4],
      ['cost_questions', 3],
    ]);
    expect(s.reasons.find((r) => r.code === 'pro_questions')?.label).toBe('4 שאלות על אלומיניום');
    expect(s.reasons.find((r) => r.code === 'stage')?.label).toBe('שלב היתר/מכרז: בוחרים עכשיו קבלנים וספקים');
    expect(s.reasons.find((r) => r.code === 'budget')?.label).toBe('תקציב של כ-2.6 מיליון ₪');
    // The points shown are exactly the score.
    expect(s.reasons.reduce((sum, r) => sum + r.points, 0)).toBe(s.score);
  });

  it('gives an empty file 0 and lists everything missing', () => {
    const s = scoreProjectFile({ version: 1 });
    expect(s).toMatchObject({ score: 0, band: 'cool', reasons: [] });
    expect(s.missing).toEqual(['שלב', 'אזור', 'גודל הבית', 'תקציב', 'מועד כניסה']);
  });

  it('ranks stage urgency: permit and frame highest, moving-in lowest', () => {
    const stage = (id: ProjectFile['stage']) => scoreProjectFile({ version: 1, stage: id }).score;
    expect(stage('permit')).toBe(stage('frame'));
    expect(stage('permit')).toBeGreaterThan(stage('planning'));
    expect(stage('planning')).toBeGreaterThan(stage('infrastructure'));
    expect(stage('infrastructure')).toBeGreaterThan(stage('finishing'));
    expect(stage('finishing')).toBeGreaterThan(stage('moving-in'));
  });

  it('steps the budget points by the midpoint', () => {
    expect(budgetPoints(3_500_000)).toBe(25);
    expect(budgetPoints(3_000_000)).toBe(25);
    expect(budgetPoints(2_999_999)).toBe(21);
    expect(budgetPoints(1_200_000)).toBe(11);
    expect(budgetPoints(300_000)).toBe(3);
    expect(budgetPoints(0)).toBe(0);
    expect(budgetPoints(null)).toBe(0);
    expect(BUDGET_STEPS[0][1]).toBe(SCORE_WEIGHTS.budget);
  });

  it('falls back to the planner estimate when no budget was stated', () => {
    const s = scoreProjectFile({
      version: 1,
      plannerEstimate: { totalMin: 1_800_000, totalMax: 2_200_000, at: at(1), inputs: {} },
    });
    expect(s.reasons.map((r) => r.code)).toEqual(['budget_planner', 'planner']);
    expect(s.score).toBe(21 + 6);
    expect(s.reasons[0].label).toBe('הערכת תקציב במחשבון: כ-2 מיליון ₪');
  });

  it('counts completeness at 4 points per core fact', () => {
    const s = scoreProjectFile({ version: 1, regionSlug: 'south', sizeM2: 180 });
    expect(s.reasons).toEqual([{ code: 'completeness', group: 'completeness', label: '2 מתוך 5 פרטים בתיק', points: 8 }]);
    expect(s.missing).toEqual(['שלב', 'תקציב', 'מועד כניסה']);
  });

  it('caps each intent signal and the whole intent group at 30', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ q: `כמה עולה קבלן חשמל מספר ${i}?`, at: at(i + 1) }));
    const file = sanitizeProjectFile({
      questions: many,
      plannerEstimate: { totalMin: 1, totalMax: 2, at: at(2), inputs: {} },
      shortlistBusinessIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ],
      savedCount: 7,
    });
    const s = scoreProjectFile(file, { visits: 9 });
    const intent = s.reasons.filter((r) => r.group === 'intent');
    expect(intent.reduce((sum, r) => sum + r.points, 0)).toBe(SCORE_WEIGHTS.intent);
    expect(intent.find((r) => r.code === 'pro_questions')?.points).toBe(9);
    expect(intent.find((r) => r.code === 'cost_questions')?.points).toBe(9);
    expect(intent.find((r) => r.code === 'shortlist')?.label).toBe('4 בעלי מקצוע ברשימה הקצרה');
    // Outside intent, only the (tiny) planner budget scores: 3 points.
    expect(s.score).toBe(SCORE_WEIGHTS.intent + 3);
  });

  it('treats a second visit and a first visit differently', () => {
    expect(scoreProjectFile({ version: 1 }, { visits: 1 }).score).toBe(0);
    expect(scoreProjectFile({ version: 1 }, { visits: 2 }).reasons[0]).toMatchObject({ code: 'visits', points: 2, label: 'ביקור שני באתר' });
  });

  it('never leaves 0..100 and bands at the thresholds', () => {
    const max = sanitizeProjectFile({
      ...TOP_LEAD_FILE,
      budgetRangeNis: [5_000_000, 6_000_000],
      plannerEstimate: { totalMin: 5_000_000, totalMax: 6_000_000, at: at(3), inputs: {} },
      shortlistBusinessIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
      savedCount: 9,
    });
    expect(scoreProjectFile(max, { visits: 12 }).score).toBe(100);
    expect(bandFor(BAND_THRESHOLDS.hot)).toBe('hot');
    expect(bandFor(BAND_THRESHOLDS.hot - 1)).toBe('warm');
    expect(bandFor(BAND_THRESHOLDS.warm)).toBe('warm');
    expect(bandFor(BAND_THRESHOLDS.warm - 1)).toBe('cool');
  });

  it('is deterministic', () => {
    expect(scoreProjectFile(TOP_LEAD_FILE, { visits: 3 })).toEqual(scoreProjectFile(TOP_LEAD_FILE, { visits: 3 }));
  });
});
