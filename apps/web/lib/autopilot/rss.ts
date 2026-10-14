/**
 * Feed parsing for detection: the YouTube channel Atom feed (free, no key,
 * the 15 newest uploads) and an optional podcast RSS 2.0 feed.
 *
 * Both feeds are flat and machine-generated, so a small tolerant tag reader is
 * enough (no XML dependency). It handles namespaced tags, attributes in either
 * quote style, CDATA sections and XML/HTML numeric entities.
 */

export interface FeedItem {
  kind: 'youtube' | 'podcast';
  externalId: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationS: number | null;
  description: string | null;
}

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeXmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, cdata: string) => cdata.replace(/&/g, '\u0000amp;'))
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? m;
    })
    .replace(/\u0000amp;/g, '&')
    .trim();
}

function escapeTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Inner XML of every <tag>...</tag> block (non-nested tags only). */
export function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`, 'g');
  return Array.from(xml.matchAll(re), (m) => m[1]);
}

/** Decoded text of the first <tag>, or null. Self-closing tags have no text. */
export function tagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tag)}>`);
  const m = xml.match(re);
  if (!m) return null;
  const text = decodeXmlText(m[1]);
  return text || null;
}

/** An attribute of the first <tag ...> (self-closing or not), decoded. */
export function tagAttr(xml: string, tag: string, attr: string, where?: (attrs: string) => boolean): string | null {
  const re = new RegExp(`<${escapeTag(tag)}(\\s[^>]*?)/?>`, 'g');
  for (const m of Array.from(xml.matchAll(re))) {
    const attrs = m[1];
    if (where && !where(attrs)) continue;
    const a = attrs.match(new RegExp(`\\s${escapeTag(attr)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
    if (a) return decodeXmlText(a[1] ?? a[2] ?? '') || null;
  }
  return null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** "1:02:03", "62:03", "3723" -> seconds (itunes:duration). */
export function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v));
  const parts = v.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return Math.round(parts.reduce((acc, p) => acc * 60 + Number(p), 0));
}

/** Canonical thumbnail: i.ytimg.com hqdefault (the feed's i2/i3/i4 hosts are mirrors). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** YouTube channel Atom feed -> items, newest first as in the feed. Invalid entries are dropped. */
export function parseYoutubeFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const entry of blocks(xml, 'entry')) {
    const id = tagText(entry, 'yt:videoId') ?? tagText(entry, 'id')?.replace(/^yt:video:/, '') ?? null;
    if (!id || !YOUTUBE_ID_RE.test(id)) continue;
    const title = tagText(entry, 'title') ?? tagText(entry, 'media:title');
    if (!title) continue;
    out.push({
      kind: 'youtube',
      externalId: id,
      title,
      url: tagAttr(entry, 'link', 'href', (a) => /rel\s*=\s*["']alternate["']/.test(a)) ?? `https://www.youtube.com/watch?v=${id}`,
      publishedAt: isoDate(tagText(entry, 'published')),
      thumbnailUrl: youtubeThumbnail(id),
      durationS: null, // not in the feed; captions fetch fills it in
      description: tagText(entry, 'media:description'),
    });
  }
  return out;
}

/** Podcast RSS 2.0 (+ iTunes tags) -> items. The GUID (else enclosure URL, else link) is the id. */
export function parsePodcastFeed(xml: string): FeedItem[] {
  const channelImage =
    tagAttr(xml.split(/<item[\s>]/)[0] ?? '', 'itunes:image', 'href') ??
    tagText(blocks(xml.split(/<item[\s>]/)[0] ?? '', 'image')[0] ?? '', 'url');
  const out: FeedItem[] = [];
  for (const item of blocks(xml, 'item')) {
    const title = tagText(item, 'title') ?? tagText(item, 'itunes:title');
    const enclosure = tagAttr(item, 'enclosure', 'url');
    const link = tagText(item, 'link');
    const id = tagText(item, 'guid') ?? enclosure ?? link;
    if (!title || !id) continue;
    out.push({
      kind: 'podcast',
      externalId: id.slice(0, 300),
      title,
      url: enclosure ?? link,
      publishedAt: isoDate(tagText(item, 'pubDate')),
      thumbnailUrl: tagAttr(item, 'itunes:image', 'href') ?? channelImage ?? null,
      durationS: parseDuration(tagText(item, 'itunes:duration')),
      description: tagText(item, 'description') ?? tagText(item, 'itunes:summary'),
    });
  }
  return out;
}
