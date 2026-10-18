import { beforeEach, describe, expect, it } from 'vitest';
import type { VideoRecord } from '@/app/api/_lib/data';
import { clearRuntimeVideos, forgetRuntimeVideo, recallRuntimeVideo, rememberRuntimeVideo } from '@/lib/autopilot/registry';
import { sumUsageSince } from '@/lib/autopilot/store';

const video = (over: Partial<VideoRecord>): VideoRecord =>
  ({ id: 'RRRRRRRRRRR', youtube_id: 'RRRRRRRRRRR', title: 't', summary: '', key_points: [], ...over }) as VideoRecord;

beforeEach(() => clearRuntimeVideos());

describe('runtime video registry', () => {
  it('keeps a complete record when a search match brings a partial one', () => {
    rememberRuntimeVideo(video({ key_points: ['נקודה'] }), { complete: true, now: 1_000 });
    rememberRuntimeVideo(video({ key_points: [] }), { now: 2_000 });
    expect(recallRuntimeVideo('RRRRRRRRRRR', 2_000)?.key_points).toEqual(['נקודה']);
    // ...and the match refreshed its age.
    expect(recallRuntimeVideo('RRRRRRRRRRR', 2_000 + 9 * 60_000)).not.toBeNull();
  });

  it('expires entries and forgets on unpublish', () => {
    rememberRuntimeVideo(video({}), { now: 0 });
    expect(recallRuntimeVideo('RRRRRRRRRRR', 11 * 60_000)).toBeNull();
    rememberRuntimeVideo(video({}), { now: 0 });
    forgetRuntimeVideo('RRRRRRRRRRR');
    expect(recallRuntimeVideo('RRRRRRRRRRR', 1)).toBeNull();
  });
});

describe('30-day spend', () => {
  it('sums only usage entries inside the window', () => {
    const since = Date.parse('2026-09-15T00:00:00Z');
    expect(
      sumUsageSince(
        [
          { usd_micros: 100, at: '2026-09-01T00:00:00Z' },
          { usd_micros: 200, at: '2026-09-20T00:00:00Z' },
          { usd_micros: 50, at: '2026-10-14T00:00:00Z' },
          { usd_micros: 999, at: 'not a date' },
        ],
        since,
      ),
    ).toBe(250);
  });
});
