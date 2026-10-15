/**
 * The seeded price book: the owner's 2026 figures (lib/planner/price-book.seed.json).
 *
 * The same JSON is the seed row of planner_price_book
 * (supabase/migrations/20261014124000_growth_planner_price_book.sql; a test keeps
 * them identical). Pages load the current DB version with loadPriceBook()
 * (lib/planner/price-book.ts) and fall back to this when the DB is unavailable.
 * Synchronous callers (lib/calculator.ts, the homepage example) use it directly.
 *
 * Client-safe: no zod here (the schema lives in lib/planner/schema.ts, server side).
 */
import seed from './price-book.seed.json';
import { EXTRA_IDS, FINISH_LEVEL_IDS, type PriceBook } from './types';
import { BUILD_STAGES } from '@/lib/stages';

export const DEFAULT_PRICE_BOOK: PriceBook = seed as unknown as PriceBook;

/**
 * Fill keys a stored book may lack (a region, extra or stage added after it was
 * saved) from the defaults, so an older DB row never breaks the engine.
 */
export function withDefaults(book: PriceBook, defaults: PriceBook = DEFAULT_PRICE_BOOK): PriceBook {
  const finishLevels = { ...defaults.finishLevels };
  for (const id of FINISH_LEVEL_IDS) if (book.finishLevels?.[id]) finishLevels[id] = book.finishLevels[id];
  const extras = { ...defaults.extras };
  for (const id of EXTRA_IDS) if (book.extras?.[id]) extras[id] = book.extras[id];
  const stageSplitPct = { ...defaults.stageSplitPct };
  const timelineMonths = { ...defaults.timelineMonths };
  for (const s of BUILD_STAGES) {
    if (typeof book.stageSplitPct?.[s.id] === 'number') stageSplitPct[s.id] = book.stageSplitPct[s.id];
    if (Array.isArray(book.timelineMonths?.[s.id])) timelineMonths[s.id] = book.timelineMonths[s.id];
  }
  return {
    ...defaults,
    ...book,
    finishLevels,
    extras,
    stageSplitPct,
    timelineMonths,
    regionFactors: { ...defaults.regionFactors, ...book.regionFactors },
    regionNotes: { ...(book.regionNotes ?? defaults.regionNotes) },
    floorShellFactors: { ...defaults.floorShellFactors, ...book.floorShellFactors },
    notes: { ...defaults.notes, ...book.notes },
    sources: book.sources?.length ? book.sources : defaults.sources,
  };
}
