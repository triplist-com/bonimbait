/**
 * Chunking parity with the static pipeline (scripts/transcribe/segment.py).
 *
 * fixtures/chunking-parity.json holds cue lists and the segments the Python
 * segment_transcript() produced for them (edge cases plus one real captions
 * file); regenerate it with the script described in docs/platform/AUTOPILOT.md.
 *
 * Set AUTOPILOT_PARITY_DATA_DIR to a checkout's data/processed directory to
 * also compare every stored transcript against its stored static segments.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_SEGMENT_SECS, chunkCues } from '@/lib/autopilot/chunk';
import { parseJson3 } from '@/lib/autopilot/transcript';
import type { Cue } from '@/lib/autopilot/types';

type PySegment = { segment_index: number; start_time: number; end_time: number; text: string };
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/chunking-parity.json'), 'utf8')) as {
  cases: Array<{ name: string; cues: Cue[]; expected: PySegment[] }>;
};

function asPython(cues: Cue[]): PySegment[] {
  return chunkCues(cues).map((c) => ({ segment_index: c.chunk_index, start_time: c.start_s, end_time: c.end_s, text: c.text }));
}

describe('chunkCues matches the static segmenter', () => {
  it('covers the fixture cases', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(asPython(c.cues)).toEqual(c.expected);
  });

  it('keeps chunks within the 2-5 minute window except for forced long cues', () => {
    const real = fixture.cases.find((c) => c.name.startsWith('real transcript'))!;
    const chunks = chunkCues(real.cues);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks.slice(0, -1)) {
      expect(c.end_s - c.start_s).toBeGreaterThanOrEqual(120);
      expect(c.end_s - c.start_s).toBeLessThanOrEqual(MAX_SEGMENT_SECS + 30);
    }
    expect(chunks.map((c) => c.chunk_index)).toEqual(chunks.map((_c, i) => i));
  });

  it('returns no chunks for no cues', () => {
    expect(chunkCues([])).toEqual([]);
  });
});

const dataDir = process.env.AUTOPILOT_PARITY_DATA_DIR;
describe.skipIf(!dataDir || !existsSync(join(dataDir ?? '', 'segments')))('full static corpus (AUTOPILOT_PARITY_DATA_DIR)', () => {
  it('reproduces every stored segment file from its transcript', () => {
    const transcripts = readdirSync(join(dataDir!, 'transcripts')).filter((f) => f.endsWith('.json'));
    let compared = 0;
    for (const f of transcripts) {
      const segPath = join(dataDir!, 'segments', f);
      if (!existsSync(segPath)) continue;
      const t = JSON.parse(readFileSync(join(dataDir!, 'transcripts', f), 'utf8')) as { segments: Cue[] };
      const stored = JSON.parse(readFileSync(segPath, 'utf8')) as { segments: PySegment[] };
      expect(asPython(t.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }))), f).toEqual(stored.segments);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('parses stored json3 captions into the stored transcript cues', () => {
    const rawDir = join(dataDir!, '..', 'raw', 'subtitles');
    if (!existsSync(rawDir)) return;
    let compared = 0;
    for (const f of readdirSync(rawDir).filter((x) => x.endsWith('.json') && x !== 'subtitle_status.json')) {
      const tPath = join(dataDir!, 'transcripts', f);
      if (!existsSync(tPath)) continue;
      const raw = JSON.parse(readFileSync(join(rawDir, f), 'utf8')) as unknown;
      if (!raw || typeof raw !== 'object' || !('events' in raw)) continue;
      const t = JSON.parse(readFileSync(tPath, 'utf8')) as { segments: Cue[] };
      expect(parseJson3(raw), f).toEqual(t.segments.map((s) => ({ start: s.start, end: s.end, text: s.text })));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(100);
  });
});
