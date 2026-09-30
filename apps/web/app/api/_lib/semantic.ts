import fs from 'fs';
import path from 'path';

/** A transcript segment of a video (search-index.*). */
export interface SegmentHit {
  kind: 'video';
  youtube_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
  score: number; // fused RRF score (primary ranking)
  cos: number; // raw cosine similarity (for display / confidence)
}

/** A chunk of a blog post (posts-index.*, built by scripts/build_posts_index.py). */
export interface PostHit {
  kind: 'post';
  slug: string;
  title: string;
  chunk_index: number;
  text: string;
  score: number;
  cos: number;
}

export type SearchHit = SegmentHit | PostHit;
export type HitKind = SearchHit['kind'];

type RowMeta = Omit<SegmentHit, 'score' | 'cos'> | Omit<PostHit, 'score' | 'cos'>;

interface Index {
  meta: RowMeta[];
  matrix: Float32Array; // length = N * DIM, videos first, then posts
  norms: Float32Array; // L2 norm per row
  dim: number;
  normText: string[]; // sofit-normalized text per row, for keyword search
}

let _index: Index | null = null;

function resolveDataPath(name: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'data', name),
    path.join(process.cwd(), 'apps/web/data', name),
    path.join(process.cwd(), '..', 'data', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readPart(name: string, required: boolean): { meta: unknown[]; floats: Float32Array } | null {
  const metaPath = resolveDataPath(`${name}.json`);
  const vecPath = resolveDataPath(`${name}.f32`);
  if (!metaPath || !vecPath) {
    if (required) throw new Error(`Data file not found: ${name}.json / ${name}.f32`);
    console.warn(`search index part ${name} not found; skipping`);
    return null;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as unknown[];
  const buf = fs.readFileSync(vecPath);
  const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return { meta, floats };
}

function loadIndex(): Index {
  if (_index) return _index;
  const videos = readPart('search-index', true)!;
  const posts = readPart('posts-index', false);

  const meta: RowMeta[] = [
    ...(videos.meta as Array<Omit<SegmentHit, 'score' | 'cos' | 'kind'>>).map((m) => ({ ...m, kind: 'video' as const })),
    ...((posts?.meta ?? []) as Array<Omit<PostHit, 'score' | 'cos' | 'kind'>>).map((m) => ({ ...m, kind: 'post' as const })),
  ];
  const totalFloats = videos.floats.length + (posts?.floats.length ?? 0);
  const dim = totalFloats / meta.length;
  if (!Number.isInteger(dim) || videos.floats.length !== videos.meta.length * dim) {
    throw new Error(`Matrix/meta mismatch: floats=${totalFloats}, meta=${meta.length}`);
  }
  const matrix = new Float32Array(totalFloats);
  matrix.set(videos.floats, 0);
  if (posts) matrix.set(posts.floats, videos.floats.length);

  const norms = new Float32Array(meta.length);
  for (let r = 0; r < meta.length; r++) {
    let n = 0;
    for (let i = r * dim, end = i + dim; i < end; i++) n += matrix[i] * matrix[i];
    norms[r] = Math.sqrt(n) || 1;
  }
  const normText = meta.map((m) => m.text.replace(/[ךםןףץ]/g, (c) => SOFIT_MAP[c] || c));
  _index = { meta, matrix, norms, dim, normText };
  return _index;
}

async function embedQuery(text: string): Promise<Float32Array> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: text, model: 'text-embedding-3-small' }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return Float32Array.from(data.data[0].embedding);
}

function cosine(a: Float32Array, matrix: Float32Array, rowStart: number, dim: number, norm: number): number {
  // The query vector is normalized by the caller.
  let dot = 0;
  for (let i = 0; i < dim; i++) dot += a[i] * matrix[rowStart + i];
  return dot / norm;
}

// Hebrew interrogatives / stopwords to drop before keyword fusion.
const HEBREW_STOPWORDS = new Set([
  'כמה', 'מה', 'איך', 'למה', 'האם', 'מי', 'מתי', 'איפה', 'איזה', 'איזו',
  'של', 'על', 'את', 'עם', 'או', 'גם', 'כן', 'לא', 'זה', 'זאת', 'הוא', 'היא',
  'אני', 'אתה', 'את', 'אנחנו', 'הם', 'הן', 'יש', 'אין',
  'צריך', 'צריכה', 'יכול', 'יכולה',
  'ליד', 'לפני', 'אחרי', 'בין', 'תחת', 'מעל',
  'ב', 'ל', 'מ', 'ה', 'ו', 'כ', 'ש',
]);

const SOFIT_MAP: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

function normalizeHebrewToken(tok: string): string {
  // Only sofit normalization — prefix-stripping a single Hebrew letter
  // is too aggressive (eats real content letters like the כ in כיריים).
  return tok.replace(/[ךםןףץ]/g, (c) => SOFIT_MAP[c] || c);
}

function extractContentTerms(query: string): string[] {
  // Keep Hebrew (U+0590-U+05FF), Latin letters, and whitespace; drop punctuation/digits.
  const cleaned = query.replace(/[^֐-׿a-zA-Z\s]/g, ' ');
  const raw = cleaned.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const r of raw) {
    if (HEBREW_STOPWORDS.has(r)) continue;
    const n = normalizeHebrewToken(r);
    if (n.length < 2) continue;
    if (HEBREW_STOPWORDS.has(n)) continue;
    out.push(n);
  }
  return out;
}

function matchTerm(normText: string, t: string): boolean {
  if (normText.includes(t)) return true;
  if (t.length > 3 && 'הובלמכש'.includes(t[0]) && normText.includes(t.slice(1))) return true;
  return false;
}

function weightedKeywordScore(
  normText: string,
  terms: string[],
  weights: number[],
): number {
  if (terms.length === 0) return 0;
  let s = 0;
  let total = 0;
  for (let i = 0; i < terms.length; i++) {
    total += weights[i];
    if (matchTerm(normText, terms[i])) s += weights[i];
  }
  return total > 0 ? s / total : 0;
}

function computeIdfWeights(allNormText: string[], terms: string[]): number[] {
  const N = allNormText.length;
  return terms.map((t) => {
    let df = 0;
    for (let i = 0; i < N; i++) if (matchTerm(allNormText[i], t)) df += 1;
    // IDF smoothed; rarer terms get higher weight.
    return Math.log((N + 1) / (df + 1)) + 1;
  });
}

/**
 * Hybrid search over video segments and post chunks: Reciprocal Rank Fusion of
 * cosine similarity and IDF-weighted keyword overlap. Only rows of the given
 * kinds are ranked (IDF is computed over those rows too).
 */
export async function semanticSearch(
  query: string,
  topK: number = 30,
  kinds: readonly HitKind[] = ['video', 'post'],
): Promise<SearchHit[]> {
  const idx = loadIndex();
  const qvec = await embedQuery(query);
  let qn = 0;
  for (let i = 0; i < qvec.length; i++) qn += qvec[i] * qvec[i];
  qn = Math.sqrt(qn) || 1;
  for (let i = 0; i < qvec.length; i++) qvec[i] /= qn;

  const { matrix, norms, meta, dim, normText } = idx;
  const rows: number[] = [];
  for (let i = 0; i < meta.length; i++) if (kinds.includes(meta[i].kind)) rows.push(i);
  const terms = extractContentTerms(query);
  const idf = terms.length > 0 ? computeIdfWeights(rows.map((i) => normText[i]), terms) : [];

  // Reciprocal Rank Fusion between cosine and keyword ranking
  const cos = new Float64Array(meta.length);
  const cosScores: Array<{ i: number; s: number }> = new Array(rows.length);
  const kwScores: Array<{ i: number; s: number }> = new Array(rows.length);
  for (let r = 0; r < rows.length; r++) {
    const i = rows[r];
    cos[i] = cosine(qvec, matrix, i * dim, dim, norms[i]);
    cosScores[r] = { i, s: cos[i] };
    kwScores[r] = { i, s: weightedKeywordScore(normText[i], terms, idf) };
  }
  const cosRank = cosScores.sort((a, b) => b.s - a.s);
  const kwRank = kwScores.sort((a, b) => b.s - a.s);
  const K = 60;
  const KW_WEIGHT = 1.5; // keyword signal is highly diagnostic for niche Hebrew queries
  const rrf = new Float64Array(meta.length);
  for (let r = 0; r < cosRank.length; r++) rrf[cosRank[r].i] += 1 / (K + r + 1);
  for (let r = 0; r < kwRank.length; r++) {
    if (kwRank[r].s > 0) rrf[kwRank[r].i] += KW_WEIGHT / (K + r + 1);
  }

  const merged = rows.slice().sort((a, b) => rrf[b] - rrf[a]);
  return merged.slice(0, topK).map((i) => ({ ...meta[i], score: rrf[i], cos: cos[i] }) as SearchHit);
}

/** Video segments only (the /api/search result list). */
export async function semanticSearchSegments(query: string, topK: number = 30): Promise<SegmentHit[]> {
  return (await semanticSearch(query, topK, ['video'])) as SegmentHit[];
}

export function groupByVideo(hits: SegmentHit[]): Map<string, SegmentHit[]> {
  const map = new Map<string, SegmentHit[]>();
  for (const h of hits) {
    const arr = map.get(h.youtube_id);
    if (arr) arr.push(h);
    else map.set(h.youtube_id, [h]);
  }
  return map;
}
