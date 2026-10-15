/**
 * JSON for an inline <script type="application/ld+json">. "<" is escaped
 * (<), so text inside the data (titles, summaries, generated or edited
 * copy) can never close the tag or open a comment; the JSON value is unchanged.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// ---------------------------------------------------------------------------
// VideoObject + key moments (Google "key moments" rich results)
//
// Every video page (/video/<youtube-id>/ static and runtime, /video/<slug>/
// legacy) builds its structured data here:
//   - named moments (chapters, else timed key points) -> Clip list (hasPart);
//   - a transcribed video without named moments -> SeekToAction, so Google can
//     pick the moments itself (our pages honour ?t=<seconds>);
//   - a title-only video (no transcript) -> neither.
// Clip and SeekToAction URLs point at OUR page (same URL path as the video).
// ---------------------------------------------------------------------------

export interface VideoMomentLike {
  /** Seconds into the video. */
  start: number;
  name: string;
}

/** 3725 -> "PT1H2M5S"; undefined for missing or non-positive lengths. */
export function isoDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${sec || (!h && !m) ? `${sec}S` : ''}`;
}

/** A Clip name: one line, at most `max` characters, cut at a word. */
export function clipName(text: string, max = 100): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/**
 * Named moments for a video: its chapters when it has at least two, else its
 * timed key points (at least two distinct seconds), else none. Sorted, inside
 * the video, one per second.
 */
export function videoMoments(video: {
  chapters?: Array<{ start_time: number; title: string }> | null;
  key_points?: Array<{ text: string; timestamp?: number }> | null;
  duration_seconds?: number | null;
}): VideoMomentLike[] {
  const inside = (t: number) => Number.isFinite(t) && t >= 0 && (!video.duration_seconds || t < video.duration_seconds);
  const dedupe = (list: VideoMomentLike[]) => {
    const seen = new Set<number>();
    return list
      .sort((a, b) => a.start - b.start)
      .filter((m) => (seen.has(m.start) ? false : (seen.add(m.start), true)));
  };
  const chapters = dedupe(
    (video.chapters ?? [])
      .filter((c) => c.title?.trim() && inside(c.start_time))
      .map((c) => ({ start: Math.floor(c.start_time), name: clipName(c.title) })),
  );
  if (chapters.length >= 2) return chapters;
  const points = dedupe(
    (video.key_points ?? [])
      .filter((k): k is { text: string; timestamp: number } => typeof k.timestamp === 'number' && Boolean(k.text?.trim()) && inside(k.timestamp))
      .map((k) => ({ start: Math.floor(k.timestamp), name: clipName(k.text) })),
  );
  return points.length >= 2 ? points : [];
}

/** `pageUrl` (absolute, may already carry a query) at a second: …/video/x/?t=95 */
export function momentUrl(pageUrl: string, start: number): string {
  return `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}t=${Math.floor(start)}`;
}

export const SEEK_TO_PARAM = 'seek_to_second_number';

export interface VideoObjectInput {
  youtubeId: string;
  name: string;
  description: string;
  thumbnailUrl: string | null | undefined;
  uploadDate?: string | null;
  durationSec?: number | null;
  /** Absolute canonical URL of the page that shows the video. */
  pageUrl: string;
  /** Named moments (Clip). */
  moments?: VideoMomentLike[];
  /** Without named moments: the page honours ?t=, offer SeekToAction. */
  seekable?: boolean;
}

export function videoObjectJsonLd(v: VideoObjectInput): Record<string, unknown> {
  const moments = v.moments ?? [];
  const duration = v.durationSec && v.durationSec > 0 ? Math.round(v.durationSec) : undefined;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: v.name,
    description: v.description,
    thumbnailUrl: v.thumbnailUrl ? [v.thumbnailUrl] : [`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`],
    uploadDate: v.uploadDate || undefined,
    duration: isoDuration(duration),
    embedUrl: `https://www.youtube.com/embed/${v.youtubeId}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.youtubeId}`,
    url: v.pageUrl,
    inLanguage: 'he-IL',
  };
  if (moments.length) {
    data.hasPart = moments.map((m, i) => {
      const end = moments[i + 1]?.start ?? duration;
      return {
        '@type': 'Clip',
        name: m.name,
        startOffset: m.start,
        ...(end !== undefined && end > m.start ? { endOffset: end } : {}),
        url: momentUrl(v.pageUrl, m.start),
      };
    });
  } else if (v.seekable) {
    data.potentialAction = {
      '@type': 'SeekToAction',
      target: `${v.pageUrl}${v.pageUrl.includes('?') ? '&' : '?'}t={${SEEK_TO_PARAM}}`,
      'startOffset-input': `required name=${SEEK_TO_PARAM}`,
    };
  }
  return data;
}

/**
 * Problems with a VideoObject against Google's video and key-moments rules
 * (required fields, Clip order and URLs, SeekToAction shape). Empty = valid.
 */
export function videoObjectProblems(data: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const str = (k: string) => typeof data[k] === 'string' && (data[k] as string).trim().length > 0;
  if (data['@type'] !== 'VideoObject') problems.push('@type must be VideoObject');
  if (!str('name')) problems.push('name is required');
  if (!str('description')) problems.push('description is required');
  const thumbs = Array.isArray(data.thumbnailUrl) ? data.thumbnailUrl : [data.thumbnailUrl];
  if (!thumbs.length || !thumbs.every((t) => typeof t === 'string' && /^https?:\/\//.test(t))) problems.push('thumbnailUrl must be absolute URLs');
  if (!str('uploadDate') || Number.isNaN(Date.parse(String(data.uploadDate)))) problems.push('uploadDate must be an ISO 8601 date');
  if (data.duration !== undefined && !/^PT(?=\d)(\d+H)?(\d+M)?(\d+S)?$/.test(String(data.duration))) problems.push('duration must be ISO 8601');
  const page = typeof data.url === 'string' ? data.url : '';
  if (!/^https?:\/\//.test(page)) problems.push('url must be the absolute page URL');

  const durationSec = (() => {
    const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(data.duration ?? ''));
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : undefined;
  })();

  if (data.hasPart !== undefined) {
    if (data.potentialAction !== undefined) problems.push('use Clip or SeekToAction, not both');
    const clips = data.hasPart as Array<Record<string, unknown>>;
    if (!Array.isArray(clips) || clips.length === 0) problems.push('hasPart must be a non-empty Clip list');
    let prev = -1;
    const list = Array.isArray(clips) ? clips : [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const at = `hasPart[${i}]`;
      if (c['@type'] !== 'Clip') problems.push(`${at} must be a Clip`);
      if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 110) problems.push(`${at}.name must be 1-110 characters`);
      const start = c.startOffset as number;
      if (!Number.isInteger(start) || start < 0) problems.push(`${at}.startOffset must be a whole second`);
      if (start <= prev) problems.push(`${at}.startOffset must increase`);
      prev = start;
      if (c.endOffset !== undefined && !((c.endOffset as number) > start)) problems.push(`${at}.endOffset must be after startOffset`);
      if (durationSec !== undefined && ((start ?? 0) >= durationSec || (c.endOffset !== undefined && (c.endOffset as number) > durationSec))) {
        problems.push(`${at} must be inside the video`);
      }
      const url = String(c.url ?? '');
      if (!page || !url.startsWith(page.split('?')[0]) || !new RegExp(`[?&]t=${start}(?:&|$)`).test(url)) problems.push(`${at}.url must be this page at t=${start}`);
    }
  }
  if (data.potentialAction !== undefined) {
    const a = data.potentialAction as Record<string, unknown>;
    if (a['@type'] !== 'SeekToAction') problems.push('potentialAction must be a SeekToAction');
    if (typeof a.target !== 'string' || !a.target.startsWith(page.split('?')[0]) || !a.target.includes(`{${SEEK_TO_PARAM}}`)) {
      problems.push('SeekToAction target must be this page with the seek placeholder');
    }
    if (a['startOffset-input'] !== `required name=${SEEK_TO_PARAM}`) problems.push('SeekToAction startOffset-input is wrong');
  }
  if (jsonLdHtml(data).includes('<')) problems.push('unescaped "<"');
  return problems;
}
