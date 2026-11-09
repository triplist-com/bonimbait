import { describe, expect, it } from 'vitest';
import { parseYoutubeApiPlaylist, uploadsPlaylistId } from '@/lib/autopilot/youtube-api';

describe('uploadsPlaylistId', () => {
  it('swaps the UC prefix for UU', () => {
    expect(uploadsPlaylistId('UCCehs0A1gUmOUtZIhvkXVJQ')).toBe('UUCehs0A1gUmOUtZIhvkXVJQ');
  });

  it('refuses ids that are not channel ids', () => {
    expect(uploadsPlaylistId('')).toBeNull();
    expect(uploadsPlaylistId('@TomerChenRihana')).toBeNull();
    expect(uploadsPlaylistId('PLCehs0A1gUmOUtZIhvkXVJQ')).toBeNull();
  });
});

describe('parseYoutubeApiPlaylist', () => {
  it('maps items and drops non-public, untitled and invalid ones', () => {
    const items = parseYoutubeApiPlaylist({
      items: [
        {
          snippet: { title: ' שלב הפינישים ', description: 'תיאור', publishedAt: '2026-11-06T08:00:00Z', resourceId: { videoId: 'A4v1KhJAi34' } },
          contentDetails: { videoId: 'A4v1KhJAi34', videoPublishedAt: '2026-11-05T19:00:00Z' },
          status: { privacyStatus: 'public' },
        },
        { snippet: { title: 'Private video', resourceId: { videoId: 'aaaaaaaaaaa' } }, status: { privacyStatus: 'private' } },
        { snippet: { title: 'Unlisted', resourceId: { videoId: 'bbbbbbbbbbb' } }, status: { privacyStatus: 'unlisted' } },
        { snippet: { title: '', resourceId: { videoId: 'ccccccccccc' } } },
        { snippet: { title: 'bad id', resourceId: { videoId: 'short' } } },
        { snippet: { title: 'no status, snippet date', publishedAt: '2026-11-01T10:00:00Z', resourceId: { videoId: 'Hhhup44VJcI' } } },
      ],
    });
    expect(items).toEqual([
      {
        kind: 'youtube',
        externalId: 'A4v1KhJAi34',
        title: 'שלב הפינישים',
        url: 'https://www.youtube.com/watch?v=A4v1KhJAi34',
        publishedAt: '2026-11-05T19:00:00.000Z',
        thumbnailUrl: 'https://i.ytimg.com/vi/A4v1KhJAi34/hqdefault.jpg',
        durationS: null,
        description: 'תיאור',
      },
      expect.objectContaining({ externalId: 'Hhhup44VJcI', publishedAt: '2026-11-01T10:00:00.000Z', description: null }),
    ]);
  });

  it('throws on a body without items', () => {
    expect(() => parseYoutubeApiPlaylist({ kind: 'youtube#error' })).toThrow('unexpected response');
    expect(() => parseYoutubeApiPlaylist(null)).toThrow('unexpected response');
  });
});
