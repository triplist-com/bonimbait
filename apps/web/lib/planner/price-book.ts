import 'server-only';

/**
 * The current price book: the newest planner_price_book row (append-only; every
 * admin save is a new version), validated, or the seeded defaults when the DB is
 * unavailable or the row is invalid. Public read (RLS), cookie-less client, so
 * /calculator/ and the scenario pages stay static (ISR).
 */
import { cache } from 'react';
import { getPublicDb } from '@/lib/content/db';
import { DEFAULT_PRICE_BOOK } from './defaults';
import { asPlannerDb, type PlannerDb, type PlannerPriceBookRow } from './db-types';
import { validatePriceBook } from './schema';
import type { PriceBook } from './types';

export interface PriceBookVersion {
  /** Row id, null for the built-in defaults. */
  id: string | null;
  book: PriceBook;
  createdAt: string | null;
  createdBy: string | null;
  note: string | null;
  origin: 'db' | 'default';
}

const DEFAULT_VERSION: PriceBookVersion = {
  id: null,
  book: DEFAULT_PRICE_BOOK,
  createdAt: null,
  createdBy: null,
  note: null,
  origin: 'default',
};

export function versionFromRow(row: Pick<PlannerPriceBookRow, 'id' | 'data' | 'created_at' | 'created_by' | 'note'>): PriceBookVersion | null {
  const res = validatePriceBook(row.data);
  if (!res.ok) {
    console.error('[planner] invalid price book row', row.id, res.issues.slice(0, 3));
    return null;
  }
  return { id: row.id, book: res.book, createdAt: row.created_at, createdBy: row.created_by, note: row.note, origin: 'db' };
}

/** Newest valid version through `db` (any client), or null. */
export async function fetchCurrentPriceBook(db: PlannerDb): Promise<PriceBookVersion | null> {
  const { data, error } = await db
    .from('planner_price_book')
    .select('id, data, created_at, created_by, note')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const v = versionFromRow(row);
    if (v) return v;
  }
  return null;
}

/** The book every public page uses (deduped per request). Never throws. */
export const loadPriceBook = cache(async (): Promise<PriceBookVersion> => {
  const db = getPublicDb();
  if (!db) return DEFAULT_VERSION;
  try {
    return (await fetchCurrentPriceBook(asPlannerDb(db))) ?? DEFAULT_VERSION;
  } catch (err) {
    console.error('[planner] price book unavailable, using defaults:', err instanceof Error ? err.message : err);
    return DEFAULT_VERSION;
  }
});

/** Recent versions for the admin history (newest first). */
export async function listPriceBookVersions(db: PlannerDb, limit = 12): Promise<PlannerPriceBookRow[]> {
  const { data, error } = await db
    .from('planner_price_book')
    .select('id, valid_as_of, data, note, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
