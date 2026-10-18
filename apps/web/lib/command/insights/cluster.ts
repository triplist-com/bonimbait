/**
 * Agglomerative clustering of builder questions. Pure and deterministic.
 *
 * Similarity between two questions = COS_WEIGHT x cosine of their topic-text
 * embeddings + TERM_WEIGHT x prefix-tolerant term overlap. Clusters are cut
 * from an average-linkage dendrogram at THRESHOLD. Average linkage is
 * reducible, so the nearest-neighbour-chain algorithm builds the same tree in
 * O(n^2) time on the n x n similarity matrix (no O(n^3) rescans), and the
 * merge heights are monotone, which makes the threshold cut well defined.
 *
 * Calibrated on 84 labelled questions in 22 topics: at 0.55 / 0.45 / 0.30,
 * purity 0.94 and completeness 0.79 (raw-question cosine alone: 0.61 / 0.57).
 */
import { termOverlap } from './text';

export const COS_WEIGHT = 0.55;
export const TERM_WEIGHT = 0.45;
export const THRESHOLD = 0.3;

export function unitVector(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  const norm = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Symmetric n x n similarity (row-major), diagonal 1. Vectors must be unit length. */
export function similarityMatrix(
  vectors: readonly Float32Array[],
  terms: readonly (readonly string[])[],
  weights: { cos: number; terms: number } = { cos: COS_WEIGHT, terms: TERM_WEIGHT },
): Float32Array {
  const n = vectors.length;
  const sim = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    sim[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = weights.cos * dot(vectors[i], vectors[j]) + weights.terms * termOverlap(terms[i] ?? [], terms[j] ?? []);
      sim[i * n + j] = s;
      sim[j * n + i] = s;
    }
  }
  return sim;
}

export type Merge = { a: number; b: number; similarity: number };

/**
 * Average-linkage merges via the nearest-neighbour chain. Returns n-1 merges
 * (a, b are the slots merged; the lower slot carries the merged cluster).
 * Ties prefer the previous chain element, then the lowest index.
 */
export function averageLinkageMerges(sim: Float32Array, n: number): Merge[] {
  if (n <= 1) return [];
  const S = Float64Array.from(sim);
  const size = new Float64Array(n).fill(1);
  const active = new Uint8Array(n).fill(1);
  const merges: Merge[] = [];
  const chain: number[] = [];
  let remaining = n;
  let nextStart = 0;
  while (remaining > 1) {
    if (chain.length === 0) {
      while (!active[nextStart]) nextStart += 1;
      chain.push(nextStart);
    }
    const a = chain[chain.length - 1];
    const prev = chain.length >= 2 ? chain[chain.length - 2] : -1;
    let b = -1;
    let best = -Infinity;
    const row = a * n;
    for (let c = 0; c < n; c++) {
      if (!active[c] || c === a) continue;
      const s = Number.isFinite(S[row + c]) ? S[row + c] : -Infinity;
      if (s > best || (s === best && c === prev) || b === -1) {
        best = s;
        b = c;
      }
    }
    if (b === prev) {
      chain.pop();
      chain.pop();
      const keep = Math.min(a, b);
      const drop = Math.max(a, b);
      merges.push({ a: keep, b: drop, similarity: best });
      const sk = size[keep];
      const sd = size[drop];
      for (let c = 0; c < n; c++) {
        if (!active[c] || c === keep || c === drop) continue;
        const v = (sk * S[keep * n + c] + sd * S[drop * n + c]) / (sk + sd);
        S[keep * n + c] = v;
        S[c * n + keep] = v;
      }
      size[keep] = sk + sd;
      active[drop] = 0;
      remaining -= 1;
    } else {
      chain.push(b);
    }
  }
  return merges;
}

/** Cut the dendrogram: clusters whose merges all score >= threshold. Sorted by first member. */
export function cutClusters(merges: readonly Merge[], n: number, threshold: number): number[][] {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const m of merges) {
    if (!(m.similarity >= threshold)) continue;
    const ra = find(m.a);
    const rb = find(m.b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }
  return Array.from(groups.values()).sort((x, y) => x[0] - y[0]);
}

export function clusterQuestions(
  vectors: readonly Float32Array[],
  terms: readonly (readonly string[])[],
  threshold: number = THRESHOLD,
): number[][] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [[0]];
  return cutClusters(averageLinkageMerges(similarityMatrix(vectors, terms), n), n, threshold);
}

/** Unit-length mean of the members' vectors. */
export function centroid(vectors: readonly Float32Array[], members: readonly number[]): Float32Array {
  const dim = vectors[members[0]]?.length ?? 0;
  const sum = new Float32Array(dim);
  for (const m of members) {
    const v = vectors[m];
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return unitVector(sum);
}
