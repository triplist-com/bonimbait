/**
 * Transcript formats -> timed cues. Client-safe (the admin previews uploads).
 *
 * json3 / VTT / SRT parsing ports scripts/transcribe/convert_subs.py, so cues
 * (and therefore chunks, see chunk.ts) match the static pipeline exactly for
 * the same captions. Additions over the Python version: SBV (YouTube Studio
 * export), VTT cues without an hours field, rolling-caption de-duplication for
 * VTT, and plain text (timestamps estimated from the text's position).
 */
import type { Cue, TranscriptSource } from './types';

export type TranscriptFormat = 'json3' | 'vtt' | 'srt' | 'sbv' | 'txt';

/** 'HH:MM:SS.mmm', 'HH:MM:SS,mmm', 'MM:SS.mmm' or plain seconds -> seconds (convert_subs._ts_to_seconds). */
export function tsToSeconds(ts: string): number {
  const parts = ts.trim().replace(',', '.').split(':');
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  return parseFloat(parts[0]);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lrm: '', rlm: '' };

/** Caption text: drop markup tags (<c>, <i>, <00:00:01.000>), then decode entities (VTT escapes ">>" as "&gt;&gt;"). */
function cleanCaptionText(line: string): string {
  return line
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[body.toLowerCase()] ?? m;
    })
    .trim();
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string } | null>;
}

/** yt-dlp / YouTube timedtext json3 (convert_subs._parse_json3). */
export function parseJson3(data: unknown): Cue[] {
  const events: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { events?: unknown }).events)
      ? ((data as { events: unknown[] }).events)
      : [];
  const cues: Cue[] = [];
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as Json3Event;
    const startMs = typeof event.tStartMs === 'number' ? event.tStartMs : 0;
    const durationMs = typeof event.dDurationMs === 'number' ? event.dDurationMs : 0;
    const segs = Array.isArray(event.segs) ? event.segs : [];
    const text = segs
      .map((s) => (s && typeof s === 'object' && typeof s.utf8 === 'string' ? s.utf8 : ''))
      .join('')
      .trim();
    if (!text || text === '\n') continue;
    cues.push({ start: startMs / 1000, end: (startMs + durationMs) / 1000, text });
  }
  return cues;
}

const VTT_TIME = /^((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})/;

/**
 * WebVTT (convert_subs._parse_vtt). Rolling auto-captions repeat the previous
 * line at the top of each cue; repeated lines are dropped so text isn't doubled.
 */
export function parseVtt(content: string): Cue[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let previousLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].trim().match(VTT_TIME);
    if (!m) {
      i += 1;
      continue;
    }
    const start = tsToSeconds(m[1]);
    const end = tsToSeconds(m[2]);
    i += 1;
    const textLines: string[] = [];
    // A cue ends at an EMPTY line (WebVTT spec). YouTube auto-caption files put a
    // whitespace-only line first in each cue, which convert_subs.py's strip() check
    // took for the end. Also stop at the next timing line, skipping its numeric id.
    while (i < lines.length && lines[i] !== '' && !VTT_TIME.test(lines[i].trim())) {
      const isCueId = /^\d+$/.test(lines[i].trim()) && VTT_TIME.test(lines[i + 1]?.trim() ?? '');
      const line = cleanCaptionText(lines[i].trim());
      if (line && !isCueId) textLines.push(line);
      i += 1;
    }
    // Rolling captions start each cue with the line the previous cue showed.
    const fresh = textLines.length > 0 && previousLines.includes(textLines[0]) ? textLines.slice(1) : textLines;
    previousLines = textLines;
    const text = fresh.join(' ').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

const SRT_TIME = /^(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/;

/** SubRip (convert_subs._parse_srt). */
export function parseSrt(content: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = content.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const m = lines[idx].trim().match(SRT_TIME);
      if (!m) continue;
      const text = lines
        .slice(idx + 1)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ');
      const clean = cleanCaptionText(text);
      if (clean) cues.push({ start: tsToSeconds(m[1]), end: tsToSeconds(m[2]), text: clean });
      break;
    }
  }
  return cues;
}

const SBV_TIME = /^(\d{1,2}:\d{2}:\d{2}\.\d{3}),(\d{1,2}:\d{2}:\d{2}\.\d{3})$/;

/** YouTube Studio .sbv ("0:00:01.000,0:00:04.000" then text lines). */
export function parseSbv(content: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of content.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    const m = lines[0]?.trim().match(SBV_TIME);
    if (!m) continue;
    const text = cleanCaptionText(lines.slice(1).map((l) => l.trim()).filter(Boolean).join(' '));
    if (text) cues.push({ start: tsToSeconds(m[1]), end: tsToSeconds(m[2]), text });
  }
  return cues;
}

/** Hebrew speech runs at roughly 14 characters per second (used when the duration is unknown). */
export const CHARS_PER_SECOND = 14;

/**
 * Plain text (no timestamps). Sentences become cues whose times are spread
 * over the video's duration by character position: approximate, but enough
 * for chunking and "jump to" links in the right neighbourhood.
 */
export function parseTxt(content: string, durationS?: number | null): Cue[] {
  const sentences = content
    .replace(/\r\n?/g, '\n')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const total = sentences.reduce((n, s) => n + s.length + 1, 0);
  if (total === 0) return [];
  const span = durationS && durationS > 0 ? durationS : total / CHARS_PER_SECOND;
  const cues: Cue[] = [];
  let offset = 0;
  for (const s of sentences) {
    const start = (offset / total) * span;
    offset += s.length + 1;
    const end = (offset / total) * span;
    cues.push({ start: round3(start), end: round3(end), text: s });
  }
  return cues;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Guess the format from the file name, else from the content. */
export function detectFormat(content: string, filename?: string | null): TranscriptFormat {
  const ext = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === 'vtt' || ext === 'srt' || ext === 'sbv' || ext === 'txt') return ext;
  if (ext === 'json' || ext === 'json3') return 'json3';
  const head = content.trimStart().slice(0, 2000);
  if (/^WEBVTT/.test(head)) return 'vtt';
  if (/^[{[]/.test(head) && /"events"|"segs"|"tStartMs"/.test(head)) return 'json3';
  if (/^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->/m.test(head)) return 'srt';
  if (/^\d{1,2}:\d{2}:\d{2}\.\d{3},\d{1,2}:\d{2}:\d{2}\.\d{3}$/m.test(head)) return 'sbv';
  if (VTT_TIME.test(head.split('\n').find((l) => l.includes('-->'))?.trim() ?? '')) return 'vtt';
  return 'txt';
}

export const FORMAT_SOURCE: Readonly<Record<TranscriptFormat, TranscriptSource>> = {
  json3: 'upload_json3',
  vtt: 'upload_vtt',
  srt: 'upload_srt',
  sbv: 'upload_sbv',
  txt: 'upload_txt',
};

export class TranscriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptParseError';
  }
}

/** Parse any supported transcript into sorted, sane cues. Throws TranscriptParseError when nothing usable is found. */
export function parseTranscript(
  content: string,
  opts: { filename?: string | null; format?: TranscriptFormat; durationS?: number | null } = {},
): { cues: Cue[]; format: TranscriptFormat } {
  const format = opts.format ?? detectFormat(content, opts.filename);
  let cues: Cue[];
  switch (format) {
    case 'json3': {
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        throw new TranscriptParseError('קובץ ה-JSON אינו תקין.');
      }
      cues = parseJson3(data);
      break;
    }
    case 'vtt':
      cues = parseVtt(content);
      break;
    case 'srt':
      cues = parseSrt(content);
      break;
    case 'sbv':
      cues = parseSbv(content);
      break;
    default:
      cues = parseTxt(content, opts.durationS);
  }
  const clean = cues.filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.text.trim());
  if (clean.length === 0) throw new TranscriptParseError('לא נמצא טקסט בתמליל.');
  return { cues: clean, format };
}

/** Full transcript text (convert_subs: " ".join(segment texts)). */
export function cuesToText(cues: readonly Cue[]): string {
  return cues.map((c) => c.text).join(' ');
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "m:ss" / "h:mm:ss" / "ss" -> seconds; null when unparseable. */
export function parseClock(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(v)) return null;
  return v.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

/**
 * Transcript for the summariser: paragraphs of about `everyS` seconds, each
 * prefixed with its start time ("[m:ss]") so chapters and key points can cite
 * moments.
 */
export function timestampedText(cues: readonly Cue[], everyS = 25): string {
  const out: string[] = [];
  let start = -1;
  let buf: string[] = [];
  for (const c of cues) {
    if (start < 0) start = c.start;
    buf.push(c.text);
    if (c.end - start >= everyS) {
      out.push(`[${formatClock(start)}] ${buf.join(' ')}`);
      start = -1;
      buf = [];
    }
  }
  if (buf.length) out.push(`[${formatClock(Math.max(0, start))}] ${buf.join(' ')}`);
  return out.join('\n');
}
