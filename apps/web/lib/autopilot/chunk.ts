/**
 * Transcript -> searchable chunks, with the SAME parameters and split rules
 * as the static index (scripts/transcribe/segment.py, `segment_transcript`):
 * chunks of 2-5 minutes (target 3), split at pauses or sentence ends, a short
 * tail merged into the previous chunk. A line-by-line port; keep the two in
 * sync (tests/autopilot/chunk.test.ts checks parity against the Python output).
 * Client-safe.
 */
import type { Chunk, Cue } from './types';

export const MIN_SEGMENT_SECS = 120; // 2 minutes
export const MAX_SEGMENT_SECS = 300; // 5 minutes
export const TARGET_SEGMENT_SECS = 180; // 3 minutes, ideal midpoint

/** Sentence-ending characters, including Hebrew sof pasuq. */
const SENTENCE_ENDS = new Set(['.', '!', '?', '׃', ':', '…']);

/** Embedding input cap per chunk (scripts/build_search_index.py truncates to 8000 chars). */
export const EMBED_MAX_CHARS = 8000;

function isSentenceEnd(text: string): boolean {
  // Python's str.rstrip() strips Unicode whitespace, like trimEnd().
  const stripped = text.trimEnd();
  return stripped.length > 0 && SENTENCE_ENDS.has(stripped[stripped.length - 1]);
}

/** How good a split point between two consecutive cues is (higher is better). */
function pauseScore(a: Cue, b: Cue): number {
  let score = 0;
  const gap = b.start - a.end;
  score += Math.min(gap, 5.0) * 2.0; // up to 10 points for pauses
  if (isSentenceEnd(a.text)) score += 5.0;
  return score;
}

function join(cues: readonly Cue[], from: number, toInclusive: number): string {
  const texts: string[] = [];
  for (let k = from; k <= toInclusive; k++) texts.push(cues[k].text);
  return texts.join(' ');
}

export function chunkCues(cues: readonly Cue[]): Chunk[] {
  const src = cues;
  if (src.length === 0) return [];

  const result: Chunk[] = [];
  let currentStartIdx = 0;
  let segmentIndex = 0;

  let i = 0;
  while (i < src.length) {
    const currentStartTime = src[currentStartIdx].start;
    const currentEndTime = src[i].end;
    const elapsed = currentEndTime - currentStartTime;

    // Haven't reached the minimum: keep accumulating.
    if (elapsed < MIN_SEGMENT_SECS) {
      i += 1;
      continue;
    }

    // Past the maximum (or at the last cue): force a split at the best recent point.
    if (elapsed >= MAX_SEGMENT_SECS || i === src.length - 1) {
      const lookBack = Math.max(currentStartIdx + 1, i - 10);
      let bestJ = i;
      let bestScore = -1.0;
      for (let j = lookBack; j <= i; j++) {
        if (j + 1 < src.length) {
          const candidateElapsed = src[j].end - currentStartTime;
          if (candidateElapsed < MIN_SEGMENT_SECS) continue;
          const sc = pauseScore(src[j], src[j + 1]);
          if (sc > bestScore) {
            bestScore = sc;
            bestJ = j;
          }
        }
      }
      result.push({
        chunk_index: segmentIndex,
        start_s: src[currentStartIdx].start,
        end_s: src[bestJ].end,
        text: join(src, currentStartIdx, bestJ),
      });
      segmentIndex += 1;
      currentStartIdx = bestJ + 1;
      i = currentStartIdx;
      continue;
    }

    // Between min and max: split at a good point.
    if (i + 1 < src.length) {
      const score = pauseScore(src[i], src[i + 1]);
      if (score >= 5.0 || elapsed >= TARGET_SEGMENT_SECS) {
        result.push({
          chunk_index: segmentIndex,
          start_s: src[currentStartIdx].start,
          end_s: src[i].end,
          text: join(src, currentStartIdx, i),
        });
        segmentIndex += 1;
        currentStartIdx = i + 1;
        i = currentStartIdx;
        continue;
      }
    }

    i += 1;
  }

  // Flush the remaining cues; a short remainder is merged into the last chunk.
  if (currentStartIdx < src.length) {
    const text = join(src, currentStartIdx, src.length - 1);
    const remainderDuration = src[src.length - 1].end - src[currentStartIdx].start;
    if (result.length > 0 && remainderDuration < MIN_SEGMENT_SECS) {
      const last = result[result.length - 1];
      last.end_s = src[src.length - 1].end;
      last.text += ' ' + text;
    } else {
      result.push({
        chunk_index: segmentIndex,
        start_s: src[currentStartIdx].start,
        end_s: src[src.length - 1].end,
        text,
      });
    }
  }

  return result;
}
