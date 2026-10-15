import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

// React's request cache only exists in the server (RSC) build; the page and the
// sitemap modules use it, so make it the identity here.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});
import { clipName, isoDuration, jsonLdHtml, momentUrl, videoMoments, videoObjectJsonLd, videoObjectProblems } from '@/lib/jsonld';
import { isTitleOnlyVideo, legacyVideoJsonLd, staticVideoJsonLd, TITLE_ONLY_ROBOTS } from '@/lib/seo/video-pages';
import type { VideoRecord } from '@/app/api/_lib/data';

const DATA = fileURLToPath(new URL('../../data/', import.meta.url));
const videos = (JSON.parse(readFileSync(`${DATA}videos.json`, 'utf8')) as { videos: VideoRecord[] }).videos;
const rows = JSON.parse(readFileSync(`${DATA}search-index.json`, 'utf8')) as Array<{ youtube_id: string; title_only?: boolean }>;
const PAGE = 'https://bonimbait.test/video/abcdefghijk/';

function record(patch: Partial<VideoRecord> = {}): VideoRecord {
  return {
    id: 'abcdefghijk',
    youtube_id: 'abcdefghijk',
    title: 'שלד לבית פרטי',
    description: '',
    duration_seconds: 600,
    thumbnail_url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    published_at: '2026-07-16',
    view_count: 1,
    category_slug: 'structure-construction',
    category_name_he: 'שלד ובנייה',
    summary: 'סיכום',
    key_points: [],
    costs: [],
    tips: [],
    rules: [],
    warnings: [],
    materials: [],
    difficulty_level: '',
    has_transcript: true,
    segment_count: 3,
    ...patch,
  };
}

describe('ISO durations and clip names', () => {
  it('formats durations', () => {
    expect(isoDuration(3725)).toBe('PT1H2M5S');
    expect(isoDuration(3600)).toBe('PT1H');
    expect(isoDuration(60)).toBe('PT1M');
    expect(isoDuration(5)).toBe('PT5S');
    expect(isoDuration(0)).toBeUndefined();
    expect(isoDuration(null)).toBeUndefined();
  });

  it('cuts long names at a word, on one line', () => {
    expect(clipName('  שלד\nובטון  ')).toBe('שלד ובטון');
    const long = 'מילה '.repeat(40);
    const name = clipName(long);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith('…')).toBe(true);
  });

  it('adds t= to a page URL', () => {
    expect(momentUrl(PAGE, 95.7)).toBe(`${PAGE}?t=95`);
    expect(momentUrl(`${PAGE}?a=1`, 30)).toBe(`${PAGE}?a=1&t=30`);
  });
});

describe('videoMoments', () => {
  it('prefers chapters, sorted, inside the video, one per second', () => {
    const m = videoMoments({
      chapters: [
        { start_time: 300, title: 'גמרים' },
        { start_time: 0, title: 'פתיחה' },
        { start_time: 300, title: 'כפול' },
        { start_time: 900, title: 'אחרי הסוף' },
      ],
      key_points: [{ text: 'נקודה', timestamp: 10 }, { text: 'עוד', timestamp: 20 }],
      duration_seconds: 600,
    });
    expect(m).toEqual([
      { start: 0, name: 'פתיחה' },
      { start: 300, name: 'גמרים' },
    ]);
  });

  it('falls back to timed key points, and needs two moments', () => {
    expect(
      videoMoments({ chapters: [{ start_time: 0, title: 'רק אחד' }], key_points: [{ text: 'א', timestamp: 40.9 }, { text: 'ב' }, { text: 'ג', timestamp: 12 }] }),
    ).toEqual([
      { start: 12, name: 'ג' },
      { start: 40, name: 'א' },
    ]);
    expect(videoMoments({ key_points: [{ text: 'א', timestamp: 5 }] })).toEqual([]);
    expect(videoMoments({})).toEqual([]);
  });
});

describe('videoObjectJsonLd', () => {
  const base = { youtubeId: 'abcdefghijk', name: 'שם', description: 'תיאור', thumbnailUrl: null, uploadDate: '2026-07-16', durationSec: 600, pageUrl: PAGE };

  it('builds Clips on this page with end offsets', () => {
    const data = videoObjectJsonLd({ ...base, moments: [{ start: 0, name: 'א' }, { start: 120, name: 'ב' }] });
    expect(data.hasPart).toEqual([
      { '@type': 'Clip', name: 'א', startOffset: 0, endOffset: 120, url: `${PAGE}?t=0` },
      { '@type': 'Clip', name: 'ב', startOffset: 120, endOffset: 600, url: `${PAGE}?t=120` },
    ]);
    expect(data.potentialAction).toBeUndefined();
    expect(data.duration).toBe('PT10M');
    expect(videoObjectProblems(data)).toEqual([]);
  });

  it('offers SeekToAction without named moments, nothing for a non-seekable page', () => {
    const seek = videoObjectJsonLd({ ...base, seekable: true });
    expect(seek.potentialAction).toEqual({
      '@type': 'SeekToAction',
      target: `${PAGE}?t={seek_to_second_number}`,
      'startOffset-input': 'required name=seek_to_second_number',
    });
    expect(videoObjectProblems(seek)).toEqual([]);
    const plain = videoObjectJsonLd(base);
    expect(plain.hasPart).toBeUndefined();
    expect(plain.potentialAction).toBeUndefined();
    expect(videoObjectProblems(plain)).toEqual([]);
  });

  it('flags broken markup', () => {
    const good = videoObjectJsonLd({ ...base, moments: [{ start: 0, name: 'א' }, { start: 120, name: 'ב' }] });
    const broken = (patch: (d: Record<string, unknown>) => void) => {
      const d = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
      patch(d);
      return videoObjectProblems(d);
    };
    expect(broken((d) => ((d.hasPart as Array<Record<string, unknown>>)[1].startOffset = 0))).not.toEqual([]);
    expect(broken((d) => ((d.hasPart as Array<Record<string, unknown>>)[0].url = 'https://www.youtube.com/watch?v=x&t=0'))).not.toEqual([]);
    expect(broken((d) => ((d.hasPart as Array<Record<string, unknown>>)[1].endOffset = 900))).not.toEqual([]);
    expect(broken((d) => (d.potentialAction = { '@type': 'SeekToAction' }))).not.toEqual([]);
    expect(broken((d) => delete d.uploadDate)).not.toEqual([]);
    expect(broken((d) => (d.name = ''))).not.toEqual([]);
  });

  it('escapes "<" in the script tag', () => {
    const data = videoObjectJsonLd({ ...base, name: 'x </script><script>alert(1)</script>' });
    expect(jsonLdHtml(data)).not.toContain('<');
  });
});

describe('static video pages (every record in data/videos.json)', () => {
  it('marks title-only videos exactly as the search index does', () => {
    const titleOnlyRows = new Set(rows.filter((r) => r.title_only).map((r) => r.youtube_id));
    const transcriptRows = new Set(rows.filter((r) => !r.title_only).map((r) => r.youtube_id));
    for (const v of videos) {
      if (titleOnlyRows.has(v.youtube_id)) expect(isTitleOnlyVideo(v), v.youtube_id).toBe(true);
      if (transcriptRows.has(v.youtube_id)) expect(isTitleOnlyVideo(v), v.youtube_id).toBe(false);
    }
    expect(videos.filter(isTitleOnlyVideo).length).toBeGreaterThan(0);
    expect(videos.filter((v) => !isTitleOnlyVideo(v)).length).toBeGreaterThan(0);
  });

  it('builds valid VideoObject markup for every page', () => {
    let clips = 0;
    let seek = 0;
    for (const v of videos) {
      const url = `https://bonimbait.test/video/${v.youtube_id}/`;
      const data = staticVideoJsonLd(v, url);
      expect(videoObjectProblems(data), v.youtube_id).toEqual([]);
      if (isTitleOnlyVideo(v)) {
        // No moments on title-only pages: no Clip, no SeekToAction.
        expect(data.hasPart, v.youtube_id).toBeUndefined();
        expect(data.potentialAction, v.youtube_id).toBeUndefined();
      } else {
        expect(Boolean(data.hasPart) !== Boolean(data.potentialAction), v.youtube_id).toBe(true);
        if (data.hasPart) clips += 1;
        else seek += 1;
      }
    }
    expect(clips).toBeGreaterThan(100);
    expect(seek).toBeGreaterThan(0);
  });

  it('a transcribed record with chapters gets named Clips', () => {
    const data = staticVideoJsonLd(
      record({ chapters: [{ start_time: 0, title: 'פתיחה' }, { start_time: 95, title: 'יסודות' }] }),
      PAGE,
    );
    expect((data.hasPart as unknown[]).length).toBe(2);
    expect(staticVideoJsonLd(record({ has_transcript: false, segment_count: 0, chapters: [{ start_time: 0, title: 'א' }, { start_time: 9, title: 'ב' }] }), PAGE).hasPart).toBeUndefined();
  });
});

describe('legacy /video/<slug>/ pages', () => {
  const opts = {
    youtubeId: 'abcdefghijk',
    title: 'פודקאסט פרק 109',
    description: 'תיאור',
    thumbnailUrl: null,
    uploadDate: '2026-07-16',
    pageUrl: 'https://bonimbait.test/video/%D7%A4%D7%A8%D7%A7/',
    canonicalUrl: 'https://bonimbait.test/video/%D7%A4%D7%A8%D7%A7/',
  };

  it('takes moments from the indexed record, on the legacy page URL', () => {
    const data = legacyVideoJsonLd({ ...opts, record: record({ key_points: ['א', 'ב'], key_point_times: [30, 200] }) });
    const clips = data.hasPart as Array<{ url: string }>;
    expect(clips.map((c) => c.url)).toEqual([`${opts.pageUrl}?t=30`, `${opts.pageUrl}?t=200`]);
    expect(videoObjectProblems(data)).toEqual([]);
  });

  it('offers SeekToAction without an indexed transcript, and nothing when the canonical is elsewhere', () => {
    const seek = legacyVideoJsonLd({ ...opts, record: null });
    expect(seek.potentialAction).toBeDefined();
    expect(videoObjectProblems(seek)).toEqual([]);
    const elsewhere = legacyVideoJsonLd({ ...opts, canonicalUrl: 'https://bonimbait.test/some-post/', record: record({ key_points: ['א', 'ב'], key_point_times: [30, 200] }) });
    expect(elsewhere.hasPart).toBeUndefined();
    expect(elsewhere.potentialAction).toBeUndefined();
  });
});

describe('title-only pages stay out of the index', () => {
  const titleOnly = videos.find(isTitleOnlyVideo)!;
  const transcribed = videos.find((v) => !isTitleOnlyVideo(v))!;

  it('get noindex, follow metadata', async () => {
    const { generateMetadata } = await import('@/app/video/[id]/page');
    expect(TITLE_ONLY_ROBOTS).toEqual({ index: false, follow: true });
    const thin = await generateMetadata({ params: { id: titleOnly.youtube_id } });
    expect(thin.robots).toEqual({ index: false, follow: true });
    const full = await generateMetadata({ params: { id: transcribed.youtube_id } });
    expect(full.robots).toBeUndefined();
  }, 30_000); // imports the whole video route (all three page kinds): slow under a full parallel run

  it('are left out of sitemap.xml (and transcribed ones are listed)', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const urls = new Set((await sitemap()).map((e) => e.url));
    const has = (id: string) => Array.from(urls).some((u) => u.endsWith(`/video/${id}/`));
    expect(has(titleOnly.youtube_id)).toBe(false);
    expect(has(transcribed.youtube_id)).toBe(true);
    for (const v of videos.filter(isTitleOnlyVideo).slice(0, 50)) expect(has(v.youtube_id), v.youtube_id).toBe(false);
  }, 30_000);
});
