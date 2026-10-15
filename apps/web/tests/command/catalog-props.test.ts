import { describe, expect, it } from 'vitest';
import { validateEvent } from '@/lib/analytics/events';

/** The answer_completed props the content-gap engine reads (command_question_stats, command_cited_sources). */
describe('answer_completed content-gap props', () => {
  const base = { query: 'כמה עולה רצפה צפה?', sources: 3, confidence: 0.4, latency_ms: 900, model: 'claude-sonnet-4-6' };

  it('accepts top_similarity, n_sources and source_ids', () => {
    const res = validateEvent('answer_completed', {
      ...base,
      top_similarity: 0.47,
      n_sources: 3,
      source_ids: ['video:5RNVyFYpkCw', 'post:רצפה-צפה', 'podcast:ep-112'],
    });
    expect(res).toMatchObject({
      ok: true,
      event: { props: { top_similarity: 0.47, n_sources: 3, source_ids: ['video:5RNVyFYpkCw', 'post:רצפה-צפה', 'podcast:ep-112'] } },
    });
  });

  it('drops malformed source ids instead of the event, and caps the list', () => {
    const res = validateEvent('answer_completed', {
      ...base,
      source_ids: ['video:a', 42, 'evil:x', 'post: spaced out', ' post:b ', ...Array.from({ length: 12 }, (_, i) => `video:v${i}`)],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ids = res.event.props.source_ids as string[];
      expect(ids[0]).toBe('video:a');
      expect(ids[1]).toBe('post:b');
      expect(ids).toHaveLength(8);
    }
  });

  it('still works without them (the current answer route)', () => {
    expect(validateEvent('answer_completed', base).ok).toBe(true);
    expect(validateEvent('answer_completed', { ...base, top_similarity: 3 }).ok).toBe(false);
  });
});
