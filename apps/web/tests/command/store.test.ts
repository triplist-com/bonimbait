import { describe, expect, it } from 'vitest';
import { probeHitsFrom, toInsightTopic, videoHref } from '@/lib/command/insights/store';
import type { SearchHit } from '@/app/api/_lib/semantic';
import type { InsightTopicRow } from '@/lib/command/db-types';

describe('coverage probes', () => {
  it('skip title-only rows so a matching title cannot hide a gap', () => {
    const hits = [
      { kind: 'video', youtube_id: 'titleonly', segment_index: 0, start_time: 0, end_time: 0, text: 'רצפה צפה', score: 0.05, cos: 0.71, title_only: true },
      { kind: 'video', youtube_id: 'full', segment_index: 3, start_time: 95.4, end_time: 280, text: 'רצפה צפה\n...', score: 0.04, cos: 0.48 },
      { kind: 'post', slug: 'thermal', title: 'בידוד תרמי ואקוסטי', chunk_index: 1, text: '...', score: 0.03, cos: 0.47 },
    ] as unknown as SearchHit[];
    expect(probeHitsFrom(hits)).toEqual([
      { kind: 'video', youtube_id: 'full', start_time: 95.4, cos: 0.48 },
      { kind: 'post', slug: 'thermal', title: 'בידוד תרמי ואקוסטי', cos: 0.47 },
    ]);
  });

  it('links videos to the moment', () => {
    expect(videoHref('abc', 95.7)).toBe('/video/abc/?t=95');
    expect(videoHref('abc', 0)).toBe('/video/abc/');
  });
});

describe('insight topic rows', () => {
  it('map to the view model and drop malformed jsonb entries', () => {
    const row: InsightTopicRow = {
      id: 't1',
      run_id: 'r1',
      rank: 1,
      label: 'רצפה צפה',
      suggested_title: 'רצפה צפה: כמה זה עולה',
      asks: 14,
      visitors: 12,
      question_count: 4,
      asks_this_week: 5,
      asks_prev_week: 3,
      trend_pct: '66.67' as unknown as number, // numeric columns arrive as strings
      coverage: '0.4' as unknown as number,
      top_similarity: 0.5,
      coverage_level: 'partial',
      level_source: 'review',
      level_reason: 'יש סרטון מבוא',
      avg_confidence: null,
      examples: [{ q: 'כמה עולה רצפה צפה?', asks: 6 }, { nope: true }],
      nearest: [
        { kind: 'video', id: '5RNVyFYpkCw', title: 'רצפה צפה - מה זה בכלל', href: '/video/5RNVyFYpkCw/?t=95', similarity: 0.51, start_s: 95 },
        { kind: 'pdf', title: 'x', href: '/x/' },
      ],
      created_at: '2026-10-15T08:00:00Z',
    };
    expect(toInsightTopic(row)).toMatchObject({
      trendPct: 66.67,
      coverage: 0.4,
      level: 'partial',
      examples: [{ q: 'כמה עולה רצפה צפה?', asks: 6 }],
      nearest: [{ kind: 'video', id: '5RNVyFYpkCw', startS: 95, similarity: 0.51 }],
    });
  });
});
