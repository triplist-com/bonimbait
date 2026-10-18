import { describe, expect, it } from 'vitest';
import { isUnavailable, splitNotice } from '@/components/advisor/AnswerUnavailable';
import { AI_RATE_LIMITED_MESSAGE, AI_UNAVAILABLE_MESSAGE } from '@/lib/guard/aiBudget';

describe('AnswerUnavailable', () => {
  it('treats budget, kill switch and rate limit as availability notices, not answers', () => {
    expect(isUnavailable('budget')).toBe(true);
    expect(isUnavailable('disabled')).toBe(true);
    expect(isUnavailable('rate_limited')).toBe(true);
    // Refusals and errors keep their own UI (follow-ups, retry).
    expect(isUnavailable('refusal')).toBe(false);
    expect(isUnavailable('error')).toBe(false);
    expect(isUnavailable(undefined)).toBe(false);
  });

  it('leads with what happened and follows with what to do', () => {
    const budget = splitNotice(AI_UNAVAILABLE_MESSAGE);
    expect(budget.title).toBe('התשובה הכתובה לא זמינה כרגע.');
    expect(budget.body.startsWith('בינתיים')).toBe(true);
    expect(`${budget.title} ${budget.body}`).toBe(AI_UNAVAILABLE_MESSAGE);

    const busy = splitNotice(AI_RATE_LIMITED_MESSAGE);
    expect(busy.title.endsWith('.')).toBe(true);
    expect(busy.body.length).toBeGreaterThan(0);
  });

  it('keeps a one-sentence message whole', () => {
    expect(splitNotice('  אין תשובה כרגע  ')).toEqual({ title: 'אין תשובה כרגע', body: '' });
  });

  it('never says "AI" or "חכמות" to builders', () => {
    for (const m of [AI_UNAVAILABLE_MESSAGE, AI_RATE_LIMITED_MESSAGE]) {
      expect(m).not.toMatch(/\bAI\b|החכמות|בינה מלאכותית/);
    }
  });
});
