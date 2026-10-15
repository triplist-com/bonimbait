/**
 * Coverage: how close the owner's content already is to a cluster of
 * questions. Pure and client-safe.
 *
 * Each probe question (the cluster's most asked) goes through the SAME hybrid
 * search the AI answers use (app/api/_lib/semantic.ts semanticSearch: cosine
 * and keyword RRF over the static index plus published runtime videos). Its
 * similarity is the best raw cosine among the top documents that search
 * returns, i.e. the sources an answer would cite. The cluster's similarity is
 * the mean over its probes.
 *
 * Calibration (84 questions, the 2026-10 index): Hebrew questions reach 0.50
 * even against unrelated chunks, so raw cosine separates covered from missing
 * topics only roughly. GAP_BELOW / PARTIAL_BELOW are a fallback: the label
 * call (label.ts) reads the nearest titles and decides the level when it runs.
 */
import type { CoverageLevel, NearestContent } from '../types';

/** Cosine that maps to 0% and 100% coverage. */
export const COVERAGE_FLOOR = 0.4;
export const COVERAGE_CEIL = 0.65;
export const GAP_BELOW = 0.47;
export const PARTIAL_BELOW = 0.53;

export function coverageScore(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0;
  const v = (similarity - COVERAGE_FLOOR) / (COVERAGE_CEIL - COVERAGE_FLOOR);
  return Math.round(Math.max(0, Math.min(1, v)) * 10_000) / 10_000;
}

export function levelFromSimilarity(similarity: number): CoverageLevel {
  if (!(similarity >= GAP_BELOW)) return 'gap';
  return similarity < PARTIAL_BELOW ? 'partial' : 'covered';
}

export type ReviewVerdict = 'answered' | 'partial' | 'missing';

export function levelFromReview(verdict: ReviewVerdict): CoverageLevel {
  return verdict === 'answered' ? 'covered' : verdict === 'partial' ? 'partial' : 'gap';
}

/** A search hit, reduced to its document. */
export type ProbeHit =
  | { kind: 'video'; youtube_id: string; start_time: number; cos: number }
  | { kind: 'post'; slug: string; title: string; cos: number };

export type DocResolver = (hit: ProbeHit) => { title: string; href: string } | null;

/** Documents in search order (one per video or article), each with its best cosine. */
export function probeDocs(hits: readonly ProbeHit[], resolve: DocResolver, limit = 5): NearestContent[] {
  const docs: NearestContent[] = [];
  const index = new Map<string, number>();
  for (const h of hits) {
    const id = h.kind === 'video' ? h.youtube_id : h.slug;
    const key = `${h.kind}:${id}`;
    const at = index.get(key);
    if (at !== undefined) {
      const d = docs[at];
      if (h.cos > d.similarity) {
        d.similarity = h.cos;
        if (h.kind === 'video') d.startS = Math.max(0, Math.floor(h.start_time));
      }
      continue;
    }
    if (docs.length >= limit) continue;
    const meta = resolve(h);
    if (!meta) continue;
    index.set(key, docs.length);
    docs.push({
      kind: h.kind,
      id,
      title: meta.title,
      href: meta.href,
      similarity: h.cos,
      startS: h.kind === 'video' ? Math.max(0, Math.floor(h.start_time)) : null,
    });
  }
  return docs;
}

export function probeSimilarity(docs: readonly NearestContent[]): number {
  return docs.reduce((m, d) => Math.max(m, d.similarity), -1);
}

/** A cluster's coverage from its probes' documents. */
export function clusterCoverage(probes: readonly (readonly NearestContent[])[], nearestLimit = 3): {
  topSimilarity: number;
  coverage: number;
  nearest: NearestContent[];
} {
  const sims = probes.map(probeSimilarity).filter((s) => s > -1);
  const topSimilarity = sims.length ? sims.reduce((a, s) => a + s, 0) / sims.length : 0;
  const merged = new Map<string, NearestContent>();
  for (const docs of probes) {
    for (const d of docs) {
      const key = `${d.kind}:${d.id}`;
      const seen = merged.get(key);
      if (!seen || d.similarity > seen.similarity) merged.set(key, { ...d });
    }
  }
  const nearest = Array.from(merged.values())
    .sort((a, b) => b.similarity - a.similarity || a.title.localeCompare(b.title, 'he'))
    .slice(0, nearestLimit)
    .map((d) => ({ ...d, similarity: Math.round(d.similarity * 10_000) / 10_000 }));
  const rounded = Math.round(topSimilarity * 10_000) / 10_000;
  return { topSimilarity: rounded, coverage: coverageScore(rounded), nearest };
}
