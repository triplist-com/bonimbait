import { describe, expect, it, vi } from 'vitest';
import {
  assignToStages,
  leadTopic,
  normalizeForMatch,
  scoreVideo,
  titleSimilarity,
  titleWords,
  topicHits,
} from '@/lib/hub/picks';
import { isNewAccount, signupMethod } from '@/lib/hub/signup';

// Hoisted above the imports by vitest.
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }));

const zero = { purchase: 0, planning: 0, permit: 0, frame: 0, infrastructure: 0, finishing: 0, 'moving-in': 0 };

describe('topic matching', () => {
  it('normalises Hebrew quotes and final letters', () => {
    expect(normalizeForMatch('ממ״ד ותב׳׳ע')).toBe(normalizeForMatch('ממ"ד ותב\'\'ע'));
    expect(normalizeForMatch('גגות')).toBe('גגות');
    expect(normalizeForMatch('מטבחים')).toBe('מטבחימ');
  });

  it('counts a topic once whichever synonym matched', () => {
    const topics = [['אלומיניום', 'קליל', 'חלונות'], ['ריצוף'], ['טיח']];
    expect(topicHits('חלונות אלומיניום של קליל', topics)).toBe(1);
    expect(topicHits('ריצוף וטיח', topics)).toBe(2);
    expect(topicHits('מיזוג', topics)).toBe(0);
    expect(leadTopic('טיח, ריצוף ואלומיניום', topics)).toBe(2);
    expect(leadTopic('מיזוג', topics)).toBe(-1);
  });

  it('scores a video for the stage its title is about', () => {
    const scores = scoreVideo({
      title: 'לפני יציקת בטון: מה חייבים לבדוק בשלד?',
      summary: 'בדיקת ברזל לפני יציקה',
      key_points: [],
      category_slug: 'structure-construction',
    });
    expect(scores.frame).toBeGreaterThan(scores.finishing);
    expect(scores.frame).toBeGreaterThan(0);
    // A lone summary mention is not enough.
    expect(scoreVideo({ title: 'ייבוא מסין', summary: 'ריהוט גינה', key_points: [], category_slug: 'x' })['moving-in']).toBe(0);
  });
});

describe('assignToStages', () => {
  const item = (id: string, stage: keyof typeof zero, score: number, topic = 0, title = id) => ({
    item: id,
    scores: { ...zero, [stage]: score },
    topic: { [stage]: topic },
    words: titleWords(title),
    tiebreak: 0,
  });

  it('gives each item to its best stage only', () => {
    const both = { item: 'x', scores: { ...zero, frame: 5, infrastructure: 3 }, topic: {}, words: titleWords('x'), tiebreak: 0 };
    const out = assignToStages([both], 4);
    expect(out.frame).toEqual(['x']);
    expect(out.infrastructure).toEqual([]);
  });

  it('caps a topic at two picks, then fills from the rest', () => {
    const out = assignToStages(
      [
        item('alu-1', 'finishing', 9, 2, 'אלומיניום אחד'),
        item('alu-2', 'finishing', 8, 2, 'פרופיל שני'),
        item('alu-3', 'finishing', 7, 2, 'קליל שלישי'),
        item('tiles', 'finishing', 5, 1, 'ריצוף'),
      ],
      3,
    );
    expect(out.finishing).toEqual(['alu-1', 'alu-2', 'tiles']);
    expect(assignToStages([item('a', 'frame', 3, 0, 'שלד א'), item('b', 'frame', 2, 0, 'יסודות ב'), item('c', 'frame', 1, 0, 'בטון ג')], 3).frame).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('drops near-duplicate titles', () => {
    expect(titleSimilarity(titleWords('חברת GSB: שיטת ICF – קלקר/בטון/בלוק'), titleWords('חברת GSB: שיטת ICF קלקר-בטון-בלוק – מה זה ולמי מתאים'))).toBeGreaterThanOrEqual(0.5);
    const out = assignToStages(
      [
        item('gsb-1', 'frame', 9, 7, 'חברת GSB: שיטת ICF – קלקר/בטון/בלוק'),
        item('gsb-2', 'frame', 8, 7, 'חברת GSB: שיטת ICF קלקר-בטון-בלוק – מה זה ולמי מתאים'),
        item('rebar', 'frame', 5, 2, 'בדיקת ברזל לפני יציקה'),
      ],
      3,
    );
    expect(out.frame).toEqual(['gsb-1', 'rebar']);
  });
});

describe('signup_completed helpers', () => {
  it('knows a new account and its method', () => {
    const now = Date.parse('2026-10-15T10:00:00Z');
    expect(isNewAccount({ created_at: '2026-10-15T09:45:00Z' }, now)).toBe(true);
    expect(isNewAccount({ created_at: '2026-10-15T08:00:00Z' }, now)).toBe(false);
    expect(isNewAccount({ created_at: 'nope' }, now)).toBe(false);
    expect(signupMethod({ app_metadata: { provider: 'google' } })).toBe('google');
    expect(signupMethod({ app_metadata: { provider: 'email' } })).toBe('email');
    expect(signupMethod({ app_metadata: {} })).toBe('email');
  });
});
