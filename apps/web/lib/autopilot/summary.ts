/**
 * Structured video summary: categories, stages and the normalisation shared
 * by the Claude output and the admin summary editor. Client-safe.
 */
import { CONSTRUCTION_STAGES } from '@/lib/constants/community';
import type { ConstructionStage } from '@/lib/db/types';
import { formatClock, parseClock } from './transcript';
import type { SourceSummary, SummaryChapter, SummaryCost, SummaryKeyPoint } from './types';

/** AI-index video categories (videos.json); the fallback when the static file is unavailable. */
export const FALLBACK_CATEGORIES: ReadonlyArray<{ slug: string; name_he: string }> = [
  { slug: 'planning-permits', name_he: 'תכנון ורישוי' },
  { slug: 'structure-construction', name_he: 'שלד ובנייה' },
  { slug: 'finishes-design', name_he: 'גמרים ועיצוב' },
  { slug: 'electrical-plumbing', name_he: 'חשמל ואינסטלציה' },
  { slug: 'contractors-labor', name_he: 'קבלנים ועבודה' },
  { slug: 'costs-pricing', name_he: 'עלויות ומחירים' },
  { slug: 'general-tips', name_he: 'טיפים כלליים' },
  { slug: 'landscaping-yard', name_he: 'חצר ופיתוח' },
];

export const DEFAULT_CATEGORY = 'general-tips';

export const STAGES: ReadonlyArray<{ value: ConstructionStage; label: string }> = CONSTRUCTION_STAGES;

export function stageLabel(stage: ConstructionStage | null | undefined): string | null {
  return STAGES.find((s) => s.value === stage)?.label ?? null;
}

export const LIMITS = { keyPoints: 8, chapters: 12, costs: 20, tips: 8, warnings: 8, questions: 4 } as const;

function clean(s: unknown, max = 600): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function second(v: unknown, durationS: number | null): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const s = Math.floor(n);
  return durationS && durationS > 0 ? Math.min(s, Math.max(0, Math.floor(durationS) - 1)) : s;
}

function strings(list: unknown, max: number, maxLen = 400): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const x of list) {
    const s = clean(x, maxLen);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export interface RawSummary {
  summary?: unknown;
  key_points?: unknown;
  costs?: unknown;
  category_slug?: unknown;
  stage?: unknown;
  chapters?: unknown;
  tips?: unknown;
  warnings?: unknown;
  suggested_questions?: unknown;
}

/**
 * Clamp and tidy a summary: trimmed text, de-duplicated lists within limits,
 * timestamps inside the video, chapters sorted with the first at 0:00, and
 * category/stage restricted to known values.
 */
export function normalizeSummary(
  raw: RawSummary,
  opts: { durationS: number | null; categorySlugs: readonly string[] },
): Omit<SourceSummary, 'model' | 'generated_at' | 'edited_at'> {
  const keyPoints: SummaryKeyPoint[] = [];
  for (const kp of Array.isArray(raw.key_points) ? raw.key_points : []) {
    const text = clean((kp as { text?: unknown })?.text ?? kp);
    if (!text || keyPoints.some((k) => k.text === text)) continue;
    keyPoints.push({ text, start_s: second((kp as { start_s?: unknown })?.start_s, opts.durationS) });
    if (keyPoints.length >= LIMITS.keyPoints) break;
  }

  const byStart = new Map<number, SummaryChapter>();
  for (const ch of Array.isArray(raw.chapters) ? raw.chapters : []) {
    const title = clean((ch as { title?: unknown })?.title, 120);
    const start = second((ch as { start_s?: unknown })?.start_s, opts.durationS);
    if (!title || start === null || byStart.has(start)) continue;
    byStart.set(start, { title, start_s: start });
  }
  const chapters = Array.from(byStart.values())
    .sort((a, b) => a.start_s - b.start_s)
    .slice(0, LIMITS.chapters);
  if (chapters.length > 0) chapters[0] = { ...chapters[0], start_s: 0 };

  const costs: SummaryCost[] = [];
  for (const c of Array.isArray(raw.costs) ? raw.costs : []) {
    const o = (c ?? {}) as Record<string, unknown>;
    const item = clean(o.item, 160);
    const price = clean(o.price, 80);
    if (!item || !price) continue;
    costs.push({ item, price, unit: clean(o.unit, 80), context: clean(o.context, 240) });
    if (costs.length >= LIMITS.costs) break;
  }

  const category = clean(raw.category_slug, 80);
  const stage = clean(raw.stage, 40);

  return {
    summary: clean(raw.summary, 1500),
    key_points: keyPoints,
    costs,
    category_slug: opts.categorySlugs.includes(category) ? category : DEFAULT_CATEGORY,
    stage: (STAGES.find((s) => s.value === stage)?.value ?? null) as ConstructionStage | null,
    chapters,
    tips: strings(raw.tips, LIMITS.tips),
    warnings: strings(raw.warnings, LIMITS.warnings),
    suggested_questions: strings(raw.suggested_questions, LIMITS.questions, 160),
  };
}

// ---------------------------------------------------------------------------
// Admin editor text format: one item per line, fields separated by " | "
// ---------------------------------------------------------------------------
export function keyPointsToText(points: readonly SummaryKeyPoint[]): string {
  return points.map((p) => (p.start_s !== null ? `${formatClock(p.start_s)} | ${p.text}` : p.text)).join('\n');
}

export function chaptersToText(chapters: readonly SummaryChapter[]): string {
  return chapters.map((c) => `${formatClock(c.start_s)} | ${c.title}`).join('\n');
}

export function costsToText(costs: readonly SummaryCost[]): string {
  return costs.map((c) => [c.item, c.price, c.unit, c.context].join(' | ')).join('\n');
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** "m:ss | text" (time optional) per line. */
export function keyPointsFromText(text: string): Array<{ text: string; start_s: number | null }> {
  return lines(text).map((l) => {
    const [head, ...rest] = l.split('|');
    const t = parseClock(head);
    return t !== null && rest.length > 0 ? { text: rest.join('|').trim(), start_s: t } : { text: l, start_s: null };
  });
}

/** "m:ss | title" per line; lines without a valid time are dropped. */
export function chaptersFromText(text: string): Array<{ title: string; start_s: number }> {
  return lines(text).flatMap((l) => {
    const [head, ...rest] = l.split('|');
    const t = parseClock(head);
    return t !== null && rest.length > 0 ? [{ title: rest.join('|').trim(), start_s: t }] : [];
  });
}

/** "item | price | unit | context" per line. */
export function costsFromText(text: string): Array<{ item: string; price: string; unit: string; context: string }> {
  return lines(text).map((l) => {
    const [item = '', price = '', unit = '', ...context] = l.split('|').map((p) => p.trim());
    return { item, price, unit, context: context.join(' | ') };
  });
}

export function listFromText(text: string): string[] {
  return lines(text);
}
