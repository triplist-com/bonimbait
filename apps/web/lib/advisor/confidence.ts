/**
 * How well the library covers a question, from retrieval alone (before any
 * model call): the cosine similarity of the best sources, plus how many of
 * the question's content terms the chosen passages actually contain.
 *
 * - `score` (0..1) and `level` go on every answer and into `answer_completed`
 *   (the Command Center's "unanswered questions" reads low scores as gaps).
 * - `refuse` means nothing in the library is close: the advisor says so
 *   honestly and skips the model call.
 *
 * Calibrated on text-embedding-3-small over the title-prefixed index
 * (docs/platform/ADVISOR_EVAL.md): on-topic Hebrew questions score a top
 * cosine of ~0.45-0.65; off-topic ones stay under ~0.3. Pure.
 */
import type { AdvisorConfidence, ConfidenceLevel } from './types';

export const CONFIDENCE = {
  /** Cosine that maps to 0. */
  floor: 0.25,
  /** Cosine that maps to 1. */
  ceil: 0.6,
  /** Below this top cosine nothing in the library answers the question. */
  refuseBelow: 0.3,
  high: 0.62,
  medium: 0.38,
} as const;

export interface ConfidenceInput {
  /** Best-passage cosine of each source, any order. */
  cosines: number[];
  /** Share of the question's content terms found in the chosen passages (0..1), when known. */
  termCoverage?: number;
}

export interface ConfidenceResult extends AdvisorConfidence {
  refuse: boolean;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function normalise(cos: number): number {
  return clamp01((cos - CONFIDENCE.floor) / (CONFIDENCE.ceil - CONFIDENCE.floor));
}

export function levelFor(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE.high) return 'high';
  if (score >= CONFIDENCE.medium) return 'medium';
  return 'low';
}

export function computeConfidence({ cosines, termCoverage }: ConfidenceInput): ConfidenceResult {
  const sorted = cosines.filter((c) => Number.isFinite(c)).sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  if (sorted.length === 0) return { score: 0, level: 'low', topSimilarity: 0, refuse: true };
  const top3 = sorted.slice(0, 3);
  const mean = top3.reduce((a, c) => a + c, 0) / top3.length;
  let score = 0.65 * normalise(top) + 0.35 * normalise(mean);
  if (typeof termCoverage === 'number') score = 0.8 * score + 0.2 * clamp01(termCoverage);
  score = Math.round(clamp01(score) * 1000) / 1000;
  return {
    score,
    level: levelFor(score),
    topSimilarity: Math.round(top * 1000) / 1000,
    refuse: top < CONFIDENCE.refuseBelow,
  };
}
