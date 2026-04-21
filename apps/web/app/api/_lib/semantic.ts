import fs from 'fs';
import path from 'path';

export interface SegmentHit {
  youtube_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
  score: number; // fused RRF score (primary ranking)
  cos: number; // raw cosine similarity (for display / confidence)
}

interface SegmentMeta {
  youtube_id: string;
  segment_index: number;
  start_time: number;
  end_time: number;
  text: string;
}

interface Index {
  meta: SegmentMeta[];
  matrix: Float32Array; // length = N * DIM
  dim: number;
  normText: string[]; // sofit-normalized text per segment, for keyword search
}

let _index: Index | null = null;

function resolveDataPath(name: string): string {
  const candidates = [
    path.join(process.cwd(), 'data', name),
    path.join(process.cwd(), 'apps/web/data', name),
    path.join(process.cwd(), '..', 'data', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Data file not found: ${name} (tried ${candidates.join(', ')})`);
}

function loadIndex(): Index {
  if (_index) return _index;
  const metaRaw = fs.readFileSync(resolveDataPath('search-index.json'), 'utf8');
  const meta = JSON.parse(metaRaw) as SegmentMeta[];
  const buf = fs.readFileSync(resolveDataPath('search-index.f32'));
  const floats = buf.byteLength / 4;
  const matrix = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    floats,
  );
  const dim = floats / meta.length;
  if (!Number.isInteger(dim)) {
    throw new Error(`Matrix/meta mismatch: floats=${floats}, meta=${meta.length}`);
  }
  const normText = meta.map((m) => m.text.replace(/[ךםןףץ]/g, (c) => SOFIT_MAP[c] || c));
  _index = { meta, matrix, dim, normText };
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

function cosine(a: Float32Array, matrix: Float32Array, rowStart: number, dim: number): number {
  let dot = 0;
  let nb = 0;
  for (let i = 0; i < dim; i++) {
    const va = a[i];
    const vb = matrix[rowStart + i];
    dot += va * vb;
    nb += vb * vb;
  }
  // Query vector is expected to be unit-norm from OpenAI, but normalize anyway.
  // We only compare scores so na is common; skip.
  const denom = Math.sqrt(nb) || 1;
  return dot / denom;
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

export async function semanticSearchSegments(
  query: string,
  topK: number = 30,
): Promise<SegmentHit[]> {
  const idx = loadIndex();
  const qvec = await embedQuery(query);
  let qn = 0;
  for (let i = 0; i < qvec.length; i++) qn += qvec[i] * qvec[i];
  qn = Math.sqrt(qn) || 1;
  for (let i = 0; i < qvec.length; i++) qvec[i] /= qn;

  const { matrix, meta, dim, normText } = idx;
  const terms = extractContentTerms(query);
  const idf = terms.length > 0 ? computeIdfWeights(normText, terms) : [];

  // Reciprocal Rank Fusion between cosine and keyword ranking
  const cosScores: Array<{ i: number; s: number }> = new Array(meta.length);
  const kwScores: Array<{ i: number; s: number }> = new Array(meta.length);
  for (let i = 0; i < meta.length; i++) {
    cosScores[i] = { i, s: cosine(qvec, matrix, i * dim, dim) };
    kwScores[i] = { i, s: weightedKeywordScore(normText[i], terms, idf) };
  }
  const cosRank = [...cosScores].sort((a, b) => b.s - a.s);
  const kwRank = [...kwScores].sort((a, b) => b.s - a.s);
  const K = 60;
  const KW_WEIGHT = 1.5; // keyword signal is highly diagnostic for niche Hebrew queries
  const rrf = new Float64Array(meta.length);
  for (let r = 0; r < cosRank.length; r++) rrf[cosRank[r].i] += 1 / (K + r + 1);
  for (let r = 0; r < kwRank.length; r++) {
    if (kwRank[r].s > 0) rrf[kwRank[r].i] += KW_WEIGHT / (K + r + 1);
  }

  const merged: Array<{ i: number; rrf: number; cos: number }> = new Array(meta.length);
  for (let i = 0; i < meta.length; i++) {
    merged[i] = { i, rrf: rrf[i], cos: cosScores[i].s };
  }
  merged.sort((a, b) => b.rrf - a.rrf);

  const out: SegmentHit[] = [];
  for (let k = 0; k < Math.min(topK, merged.length); k++) {
    const { i, cos, rrf: r } = merged[k];
    const m = meta[i];
    out.push({ ...m, score: r, cos });
  }
  return out;
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
