import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/** Typed Supabase client accepted by every data-access function. */
export type DbClient = SupabaseClient<Database>;

type DbError = { message: string } | null;

/**
 * Unwrap a PostgREST response that must carry data (lists, `.single()`):
 * throws on error or missing data. Callers get plain values or an Error.
 */
export function unwrap<R extends { data: unknown; error: DbError }>(result: R): NonNullable<R['data']> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) throw new Error('Query returned no data');
  return result.data as NonNullable<R['data']>;
}

/** Unwrap a `.maybeSingle()` response: throws on error, null when not found. */
export function unwrapMaybe<R extends { data: unknown; error: DbError }>(
  result: R,
): NonNullable<R['data']> | null {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? null) as NonNullable<R['data']> | null;
}

/** Throw if a write without `.select()` failed. */
export function check(result: { error: DbError }): void {
  if (result.error) throw new Error(result.error.message);
}

/** Offset pagination helper: page is 1-based. */
export function pageRange(page = 1, pageSize = 20): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
