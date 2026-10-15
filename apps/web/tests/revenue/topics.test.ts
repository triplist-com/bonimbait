import { describe, expect, it } from 'vitest';
import {
  COST_PATTERN,
  HIRING_PATTERN,
  TOPICS,
  classifyQuestion,
  specialtiesForTopics,
  topicCounts,
  topicPatterns,
  topicsForContext,
  topicsForSpecialty,
} from '@/lib/revenue/topics';

describe('classifyQuestion', () => {
  it('spots trade topics, cost and hiring intent', () => {
    expect(classifyQuestion('כמה עולים חלונות אלומיניום לבית של 220 מ״ר?')).toEqual({ cost: true, pro: true, topics: ['windows'] });
    expect(classifyQuestion('איך בוחרים קבלן שלד אמין?')).toEqual({ cost: false, pro: true, topics: ['frame'] });
    expect(classifyQuestion('מה המחיר למ״ר לבנייה פרטית ב-2026?')).toEqual({ cost: true, pro: false, topics: [] });
    expect(classifyQuestion('מתי מגישים בקשה להיתר?')).toEqual({ cost: false, pro: false, topics: [] });
    expect(classifyQuestion('')).toEqual({ cost: false, pro: false, topics: [] });
    expect(classifyQuestion(null)).toEqual({ cost: false, pro: false, topics: [] });
  });

  it('avoids the common false positives', () => {
    // "שקלתי" (I considered), "השקעה" (investment), "שישה" (six), "גמרנו" (we finished).
    expect(classifyQuestion('שקלתי השקעה בשישה חדרים, גמרנו לתכנן').topics).toEqual([]);
    expect(classifyQuestion('שקלתי השקעה בשישה חדרים, גמרנו לתכנן').cost).toBe(false);
  });

  it('ignores niqqud and extra spaces', () => {
    expect(classifyQuestion('  כַּמָּה   עוֹלֶה   מַזְגָן ? ')).toEqual({ cost: true, pro: true, topics: ['hvac'] });
  });
});

describe('topic map', () => {
  it('maps specialties both ways', () => {
    expect(topicsForSpecialty('קבלני-אלומיניום')).toEqual(['windows']);
    expect(topicsForSpecialty('nope')).toEqual([]);
    expect(specialtiesForTopics(['windows'])).toContain('קבלני-אלומיניום');
    expect(new Set(specialtiesForTopics(['frame', 'frame'])).size).toBe(specialtiesForTopics(['frame']).length);
  });

  it('resolves free context (topic key, specialty slug, title text)', () => {
    expect(topicsForContext('windows')).toEqual(['windows']);
    expect(topicsForContext('קבלני-חשמל')).toEqual(['electric']);
    expect(topicsForContext('איטום גגות בחורף')).toEqual(['waterproofing', 'roofing']);
    expect(topicsForContext(undefined)).toEqual([]);
  });

  it('counts the most-asked topics first', () => {
    expect(
      topicCounts(['חלונות אלומיניום?', 'תריסים חשמליים?', 'כמה עולה חשמלאי?', 'איזה חלון לממ״ד?']).map((t) => [t.key, t.count]),
    ).toEqual([
      ['windows', 3],
      ['electric', 2],
      ['safe-room', 1],
    ]);
  });

  it('keeps every pattern valid for both JavaScript and PostgreSQL', () => {
    for (const p of [COST_PATTERN, HIRING_PATTERN, ...TOPICS.map((t) => t.pattern)]) {
      expect(() => new RegExp(p, 'i')).not.toThrow();
      // No JS-only syntax: lookarounds, \b, \d shorthands or lazy quantifiers.
      expect(p).not.toMatch(/\(\?[=!<]|\\[bdwsBDWS]|\*\?|\+\?/);
    }
    expect(topicPatterns(['windows', 'nope'])).toEqual([TOPICS.find((t) => t.key === 'windows')!.pattern]);
    expect(new Set(TOPICS.map((t) => t.key)).size).toBe(TOPICS.length);
  });
});
