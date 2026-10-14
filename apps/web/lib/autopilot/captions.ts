/**
 * Server-side YouTube captions (transcript strategy (a)).
 *
 * The web player's caption URLs need a proof-of-origin token, so this asks
 * the InnerTube player API as a mobile client (ANDROID, then IOS) for the
 * caption tracks, prefers manual Hebrew over auto-generated Hebrew, and reads
 * the track as json3: the same format yt-dlp gave the static pipeline, so the
 * cues match it exactly (transcript.parseJson3).
 *
 * YouTube often refuses datacenter IPs ("confirm you're not a bot"): that and
 * every other miss is a CaptionsUnavailableError, which the pipeline turns into
 * `needs_transcript` (staff then upload or paste a transcript).
 */
import { parseJson3 } from './transcript';
import type { Cue } from './types';

export type CaptionsMissReason = 'blocked' | 'unplayable' | 'no_captions' | 'empty' | 'http_error' | 'timeout';

export class CaptionsUnavailableError extends Error {
  constructor(
    readonly reason: CaptionsMissReason,
    message: string,
  ) {
    super(message);
    this.name = 'CaptionsUnavailableError';
  }
}

export interface FetchedCaptions {
  cues: Cue[];
  source: 'captions_manual' | 'captions_auto';
  languageCode: string;
  durationS: number | null;
  title: string | null;
  client: string;
}

interface InnertubeClient {
  name: string;
  context: Record<string, unknown>;
  userAgent: string;
  clientNameId: string;
}

const CLIENTS: InnertubeClient[] = [
  {
    name: 'ANDROID',
    context: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'he', gl: 'IL' },
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    clientNameId: '3',
  },
  {
    name: 'IOS',
    context: {
      clientName: 'IOS',
      clientVersion: '20.10.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
      hl: 'he',
      gl: 'IL',
    },
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    clientNameId: '5',
  },
];

const HEBREW = new Set(['iw', 'he']);

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { lengthSeconds?: string; title?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

type FetchFn = typeof fetch;

async function fetchWithTimeout(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw new CaptionsUnavailableError('timeout', 'YouTube did not answer in time');
    throw new CaptionsUnavailableError('http_error', `YouTube request failed: ${(err as Error)?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The track URL with fmt=json3. Plain string edits on purpose: re-serializing
 * through URLSearchParams re-encodes the signed parameters (sparams=ip,ipbits…).
 */
export function json3Url(baseUrl: string): string {
  const base = baseUrl.replace(/([?&])fmt=[^&]*(&|$)/, '$1').replace(/[?&]$/, '');
  return `${base}${base.includes('?') ? '&' : '?'}fmt=json3`;
}

/** Manual Hebrew first, then auto-generated Hebrew. */
export function pickHebrewTrack(tracks: readonly CaptionTrack[]): CaptionTrack | null {
  const hebrew = tracks.filter((t) => t.baseUrl && t.languageCode && HEBREW.has(t.languageCode));
  return hebrew.find((t) => t.kind !== 'asr') ?? hebrew.find((t) => t.kind === 'asr') ?? null;
}

async function playerResponse(videoId: string, client: InnertubeClient, fetchFn: FetchFn, timeoutMs: number): Promise<PlayerResponse> {
  const res = await fetchWithTimeout(
    fetchFn,
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
        'X-YouTube-Client-Name': client.clientNameId,
        'X-YouTube-Client-Version': String(client.context.clientVersion),
      },
      body: JSON.stringify({ context: { client: client.context }, videoId, contentCheckOk: true, racyCheckOk: true }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new CaptionsUnavailableError(res.status === 429 ? 'blocked' : 'http_error', `YouTube player API ${res.status}`);
  return (await res.json()) as PlayerResponse;
}

/**
 * Hebrew captions for a YouTube video as timed cues. Throws
 * CaptionsUnavailableError when YouTube blocks the request or the video has
 * no Hebrew captions (yet: auto-captions can take hours after upload).
 */
export async function fetchYoutubeCaptions(
  videoId: string,
  opts: { fetchFn?: FetchFn; timeoutMs?: number; deadline?: number } = {},
): Promise<FetchedCaptions> {
  const fetchFn = opts.fetchFn ?? fetch;
  const perRequestMs = opts.timeoutMs ?? 8_000;
  // Each request gets what is left before the deadline, at most perRequestMs.
  const budget = (): number => {
    const left = opts.deadline ? opts.deadline - Date.now() - 500 : perRequestMs;
    if (left < 1_000) throw new CaptionsUnavailableError('timeout', 'No time left for YouTube in this request');
    return Math.min(perRequestMs, left);
  };
  let lastMiss: CaptionsUnavailableError | null = null;

  for (const client of CLIENTS) {
    try {
      const player = await playerResponse(videoId, client, fetchFn, budget());
      const status = player.playabilityStatus?.status;
      if (status === 'LOGIN_REQUIRED') {
        throw new CaptionsUnavailableError('blocked', `YouTube asked to sign in (${player.playabilityStatus?.reason ?? 'bot check'})`);
      }
      if (status && status !== 'OK') {
        throw new CaptionsUnavailableError('unplayable', `Video is ${status.toLowerCase()}: ${player.playabilityStatus?.reason ?? ''}`.trim());
      }
      const track = pickHebrewTrack(player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
      const lengthSeconds = Number(player.videoDetails?.lengthSeconds);
      const durationS = Number.isFinite(lengthSeconds) && lengthSeconds > 0 ? lengthSeconds : null;
      if (!track?.baseUrl) throw new CaptionsUnavailableError('no_captions', 'The video has no Hebrew captions yet');

      const res = await fetchWithTimeout(fetchFn, json3Url(track.baseUrl), { headers: { 'User-Agent': client.userAgent } }, budget());
      if (!res.ok) throw new CaptionsUnavailableError(res.status === 429 ? 'blocked' : 'http_error', `Captions request ${res.status}`);
      const body = await res.text();
      if (!body.trim()) throw new CaptionsUnavailableError('empty', 'YouTube returned empty captions (proof-of-origin required)');
      let data: unknown;
      try {
        data = JSON.parse(body);
      } catch {
        throw new CaptionsUnavailableError('empty', 'YouTube returned captions in an unexpected format');
      }
      const cues = parseJson3(data);
      if (cues.length === 0) throw new CaptionsUnavailableError('empty', 'The captions track has no text');
      return {
        cues,
        source: track.kind === 'asr' ? 'captions_auto' : 'captions_manual',
        languageCode: track.languageCode ?? 'iw',
        durationS,
        title: player.videoDetails?.title ?? null,
        client: client.name,
      };
    } catch (err) {
      if (!(err instanceof CaptionsUnavailableError)) throw err;
      lastMiss = err;
      // A video without Hebrew captions has none for any client; no time left is final too.
      if (err.reason === 'no_captions' || err.reason === 'unplayable' || err.reason === 'timeout') break;
    }
  }
  throw lastMiss ?? new CaptionsUnavailableError('http_error', 'YouTube captions unavailable');
}

/** Hebrew explanation for the admin (stored in knowledge_sources.error). */
export function captionsMissMessage(err: CaptionsUnavailableError): string {
  switch (err.reason) {
    case 'blocked':
    case 'empty':
      return 'יוטיוב חסם את שליפת הכתוביות מהשרת. הורידו את הכתוביות מ-YouTube Studio (קובץ ‎.vtt/.srt‎) והעלו אותן כאן, או הדביקו תמליל.';
    case 'no_captions':
      return 'לסרטון עדיין אין כתוביות בעברית. כתוביות אוטומטיות מופיעות בדרך כלל תוך כמה שעות; נסו שוב מאוחר יותר או העלו תמליל.';
    case 'unplayable':
      return 'הסרטון אינו זמין לצפייה ציבורית (פרטי, מוסתר או נמחק), ולכן אי אפשר לשלוף ממנו כתוביות.';
    case 'timeout':
      return 'יוטיוב לא ענה בזמן. נסו שוב בעוד כמה דקות.';
    default:
      return 'שליפת הכתוביות מיוטיוב נכשלה. נסו שוב או העלו תמליל.';
  }
}
