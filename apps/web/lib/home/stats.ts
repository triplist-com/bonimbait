/**
 * Live "what the answers are built on" counts for the hero:
 * "178 סרטונים · 61 שעות · 806 מאמרים". Pure helpers (unit-tested); the
 * server loader is lib/home/data.ts.
 */

export interface KnowledgeStats {
  /** Videos with transcripts in the answer index (an answer can jump into them). */
  videos: number;
  /** Their total running time, rounded to whole hours. */
  hours: number;
  /** Published guide articles. */
  articles: number;
}

type VideoLike = {
  duration_seconds?: number | string | null;
  segment_count?: number | string | null;
  has_transcript?: boolean | string | null;
};

const truthy = (v: unknown) => v === true || v === 'True' || v === 'true' || v === 1 || v === '1';

/** Count transcribed videos and their hours. */
export function computeVideoStats(videos: readonly VideoLike[]): { videos: number; hours: number } {
  let count = 0;
  let seconds = 0;
  for (const v of videos) {
    const segments = Number(v.segment_count ?? 0);
    if (!(segments > 0 || truthy(v.has_transcript))) continue;
    count += 1;
    const d = Number(v.duration_seconds ?? 0);
    if (Number.isFinite(d) && d > 0) seconds += d;
  }
  return { videos: count, hours: Math.round(seconds / 3600) };
}

/** Hebrew count with singular/plural: plural(1, 'סרטון', 'סרטונים') -> "סרטון אחד". */
export function hebrewCount(n: number, one: string, many: string, oneWord = 'אחד'): string {
  if (n === 1) return `${one} ${oneWord}`;
  return `${n.toLocaleString('he-IL')} ${many}`;
}

export interface KnowledgePart {
  value: string;
  label: string;
}

/** The three parts of the hero line, skipping zeros. */
export function knowledgeParts(stats: KnowledgeStats): KnowledgePart[] {
  const parts: KnowledgePart[] = [];
  if (stats.videos > 0) parts.push({ value: stats.videos.toLocaleString('he-IL'), label: stats.videos === 1 ? 'סרטון' : 'סרטונים' });
  if (stats.hours > 0) parts.push({ value: stats.hours.toLocaleString('he-IL'), label: stats.hours === 1 ? 'שעת וידאו' : 'שעות וידאו' });
  if (stats.articles > 0) parts.push({ value: stats.articles.toLocaleString('he-IL'), label: stats.articles === 1 ? 'מאמר' : 'מאמרים' });
  return parts;
}

/** "278 סרטונים · 90 שעות וידאו · 806 מאמרים" */
export function formatKnowledgeLine(stats: KnowledgeStats): string {
  return knowledgeParts(stats)
    .map((p) => `${p.value} ${p.label}`)
    .join(' · ');
}
