/**
 * Validation for a price book (DB rows and admin saves). Server and tests only:
 * client code never imports zod for the planner.
 */
import { z } from 'zod';
import { BUILD_STAGES } from '@/lib/stages';
import { withDefaults } from './defaults';
import { EXTRA_IDS, FINISH_LEVEL_IDS, type PriceBook } from './types';

const STAGE_IDS = BUILD_STAGES.map((s) => s.id) as [string, ...string[]];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך בפורמט YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'תאריך לא תקין');
const note = (max = 600) => z.string().max(max).default('');
const agorot = (max: number) => z.number().int().min(0).max(max);
const factor = z.number().min(0.5).max(2);
const pctRange = z
  .tuple([z.number().min(0).max(100), z.number().min(0).max(100)])
  .refine(([a, b]) => a <= b, 'הערך הנמוך גדול מהגבוה');
const monthsRange = z
  .tuple([z.number().int().min(0).max(60), z.number().int().min(0).max(60)])
  .refine(([a, b]) => a <= b, 'הערך הנמוך גדול מהגבוה');

function byIds<T extends z.ZodType>(ids: readonly string[], schema: T) {
  return z.object(Object.fromEntries(ids.map((id) => [id, schema])) as Record<string, T>);
}

const source = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,40}$/),
  kind: z.enum(['article', 'podcast']),
  title: z.string().min(1).max(300),
  date: isoDate,
  href: z.string().min(1).max(500).refine((h) => h.startsWith('/') || /^https:\/\//.test(h), 'קישור לא תקין'),
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
  startSec: z.number().int().min(0).max(86_400).optional(),
  quote: z.string().max(300).optional(),
  primary: z.boolean().optional(),
});

export const priceBookSchema = z
  .object({
    version: z.literal(1),
    validAsOf: isoDate,
    rangePct: z.number().min(1).max(50),
    vatRatePct: z.number().min(0).max(30),
    finishLevels: byIds(FINISH_LEVEL_IDS, z.object({ perM2Agorot: agorot(10_000_000).min(100_000), note: note() })),
    regionFactors: z.record(z.string().regex(/^[a-z0-9-]{2,40}$/), factor),
    regionNotes: z.record(z.string(), z.string().max(300)).default({}),
    floorShellFactors: z.object({ '1': factor, '2': factor, '3': factor }),
    stageSplitPct: byIds(STAGE_IDS, z.number().int().min(0).max(100)),
    extras: byIds(
      EXTRA_IDS,
      z.object({ amountAgorot: agorot(10_000_000_000), stage: z.enum(STAGE_IDS), enabled: z.boolean(), note: note() }),
    ),
    movingInPerM2Agorot: z
      .object({ min: agorot(10_000_000), max: agorot(10_000_000), note: note() })
      .refine((m) => m.min <= m.max, 'המינימום גדול מהמקסימום'),
    contingencyPct: z.object({ withBudget: pctRange, withoutBudget: pctRange, note: note() }),
    timelineMonths: byIds(STAGE_IDS, monthsRange),
    notes: z.object({ floors: note(1000), split: note(1000), timeline: note(1000), regions: note(1000) }),
    sources: z.array(source).min(1).max(30),
  })
  .superRefine((book, ctx) => {
    const sum = Object.values(book.stageSplitPct).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      ctx.addIssue({ code: 'custom', path: ['stageSplitPct'], message: `החלוקה לשלבים צריכה להסתכם ב-100% (עכשיו ${sum}%)` });
    }
    const ids = book.sources.map((s) => s.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'מזהה מקור כפול' });
  });

export type PriceBookIssue = { path: string; message: string };

/** Validate a candidate book; on success it is completed from the defaults. */
export function validatePriceBook(data: unknown): { ok: true; book: PriceBook } | { ok: false; issues: PriceBookIssue[] } {
  const res = priceBookSchema.safeParse(data);
  if (!res.success) {
    return { ok: false, issues: res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
  return { ok: true, book: withDefaults(res.data as unknown as PriceBook) };
}
