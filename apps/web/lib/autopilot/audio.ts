import 'server-only';

import { AUDIO_MODEL, audioCostMicros } from './pricing';
import type { Cue, UsageEntry } from './types';

/**
 * Transcript strategy (c), off unless AUTOPILOT_AUDIO_TRANSCRIPTION=true:
 * OpenAI speech-to-text of an audio file staff uploaded. whisper-1 is used
 * because it returns segment timestamps (verbose_json), which chunking and
 * chapters need. The API accepts files up to 25 MB.
 */

export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
/** Private bucket (migration 20261014103000); objects live at `<source id>/<file name>`. */
export const AUDIO_BUCKET = 'autopilot-audio';

export function isAudioTranscriptionEnabled(): boolean {
  return process.env.AUTOPILOT_AUDIO_TRANSCRIPTION === 'true';
}

/** Upper bound before the call: whisper bills per minute of audio. */
export function estimateAudioMicros(durationS: number | null, bytes: number): number {
  // Without a known duration assume a low bitrate (32 kbps) for the worst case.
  const seconds = durationS && durationS > 0 ? durationS : (bytes * 8) / 32_000;
  return audioCostMicros(seconds);
}

export async function transcribeAudio(
  file: Blob,
  filename: string,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ cues: Cue[]; durationS: number; usage: UsageEntry }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  if (file.size > AUDIO_MAX_BYTES) throw new Error('Audio file is larger than 25 MB');

  const form = new FormData();
  form.set('file', file, filename);
  form.set('model', AUDIO_MODEL);
  form.set('language', 'he');
  form.set('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 55_000);
  let res: Response;
  try {
    res = await (opts.fetchFn ?? fetch)('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`OpenAI transcription ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { duration?: number; segments?: Array<{ start: number; end: number; text: string }> };
  const cues = (data.segments ?? [])
    .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? '').trim() }))
    .filter((c) => c.text);
  const durationS = Number(data.duration) || (cues.length ? cues[cues.length - 1].end : 0);
  return {
    cues,
    durationS,
    usage: {
      step: 'transcribe_audio',
      model: AUDIO_MODEL,
      audio_seconds: Math.round(durationS),
      usd_micros: audioCostMicros(durationS),
      at: new Date().toISOString(),
    },
  };
}
