import { YOUTUBE_ID_RE, youtubeThumbnail, type FeedItem } from './rss';

/**
 * Detection fallback: the channel's uploads playlist through the YouTube Data
 * API v3 (`playlistItems.list`, 1 quota unit of the free 10,000 per day).
 *
 * The public Atom feed answers 404 to some datacenter IPs (Render's included),
 * while the Data API works from servers. It needs YOUTUBE_API_KEY, so it is
 * used only when the feed fails.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3/playlistItems';
/** As many items as the Atom feed returns. */
const MAX_RESULTS = 15;

/** A channel's uploads playlist is its id with the "UC" prefix replaced by "UU". */
export function uploadsPlaylistId(channelId: string): string | null {
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

/** The request URL, key included. Never put it in a report or a log. */
export function youtubeApiUrl(playlistId: string, apiKey: string): string {
  const qs = new URLSearchParams({
    part: 'snippet,contentDetails,status',
    playlistId,
    maxResults: String(MAX_RESULTS),
    key: apiKey,
  });
  return `${API_BASE}?${qs}`;
}

/** The same request without the key: safe to return in reports. */
export function youtubeApiReportUrl(playlistId: string): string {
  return `${API_BASE}?playlistId=${encodeURIComponent(playlistId)}`;
}

interface PlaylistItem {
  snippet?: { title?: string; description?: string; publishedAt?: string; resourceId?: { videoId?: string } };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
  status?: { privacyStatus?: string };
}

function isoDate(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** playlistItems.list JSON -> items, newest first. Non-public and invalid items are dropped. */
export function parseYoutubeApiPlaylist(json: unknown): FeedItem[] {
  const list = (json as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new Error('unexpected response');
  const out: FeedItem[] = [];
  for (const raw of list as PlaylistItem[]) {
    const privacy = raw?.status?.privacyStatus;
    if (privacy && privacy !== 'public') continue;
    const id = raw?.contentDetails?.videoId ?? raw?.snippet?.resourceId?.videoId;
    const title = raw?.snippet?.title?.trim();
    if (!id || !YOUTUBE_ID_RE.test(id) || !title) continue;
    out.push({
      kind: 'youtube',
      externalId: id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      // videoPublishedAt is the upload's own date; snippet.publishedAt is when it joined the playlist.
      publishedAt: isoDate(raw.contentDetails?.videoPublishedAt) ?? isoDate(raw.snippet?.publishedAt),
      thumbnailUrl: youtubeThumbnail(id),
      durationS: null, // not in playlistItems; the captions fetch fills it in
      description: raw.snippet?.description?.trim() || null,
    });
  }
  return out;
}

/** "HTTP 403 quotaExceeded": the status plus Google's error reason, if the body has one. */
async function apiError(res: Response): Promise<Error> {
  let reason = '';
  try {
    const body = (await res.json()) as { error?: { errors?: Array<{ reason?: string }>; status?: string } };
    reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? '';
  } catch {
    // not JSON: the status alone
  }
  return new Error(reason ? `HTTP ${res.status} ${reason}` : `HTTP ${res.status}`);
}

/** Fetch and parse the channel's newest uploads. Errors never contain the key. */
export async function fetchYoutubeUploads(
  playlistId: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<FeedItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetchFn(youtubeApiUrl(playlistId, apiKey), {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw await apiError(res);
    return parseYoutubeApiPlaylist(await res.json());
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    throw new Error(apiKey ? message.split(apiKey).join('***') : message);
  } finally {
    clearTimeout(timer);
  }
}
