import { describe, expect, it } from 'vitest';
import { keyPointsWithTimes, videoChapters } from '@/lib/knowledge/video-detail';

describe('keyPointsWithTimes', () => {
  it('returns undefined without key points', () => {
    expect(keyPointsWithTimes({ key_points: [], duration_seconds: 600 })).toBeUndefined();
  });

  it('keeps plain key points when there are no times (2026-03 summaries)', () => {
    expect(keyPointsWithTimes({ key_points: ['א', 'ב'], duration_seconds: 600 })).toEqual([{ text: 'א' }, { text: 'ב' }]);
  });

  it('attaches valid moments and drops null, negative or out-of-range ones', () => {
    const out = keyPointsWithTimes({
      key_points: ['א', 'ב', 'ג', 'ד'],
      key_point_times: [95.7, null, -3, 9999],
      duration_seconds: 600,
    });
    expect(out).toEqual([{ text: 'א', timestamp: 95 }, { text: 'ב' }, { text: 'ג' }, { text: 'ד' }]);
  });
});

describe('videoChapters', () => {
  it('sorts, trims and keeps chapters inside the video', () => {
    const out = videoChapters({
      chapters: [
        { start_time: 120, title: ' שלד ' },
        { start_time: 0, title: 'פתיחה' },
        { start_time: 700, title: 'אחרי הסוף' },
        { start_time: 60, title: '  ' },
      ],
      duration_seconds: 600,
    });
    expect(out).toEqual([
      { start_time: 0, title: 'פתיחה' },
      { start_time: 120, title: 'שלד' },
    ]);
  });

  it('needs at least two chapters', () => {
    expect(videoChapters({ chapters: [{ start_time: 0, title: 'פתיחה' }], duration_seconds: 600 })).toBeUndefined();
    expect(videoChapters({ duration_seconds: 600 })).toBeUndefined();
  });
});
