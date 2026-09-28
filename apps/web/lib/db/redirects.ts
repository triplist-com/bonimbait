/**
 * Redirects admin/import. Middleware reads them through
 * lib/redirects/lookup.ts (cached); changes take effect within
 * REDIRECT_CACHE_TTL_SECONDS.
 */
import { normalizeRedirectPath } from '@/lib/redirects/normalize';
import { type DbClient, type Paginated, pageRange, unwrap, check } from './client';
import type { RedirectCode, RedirectRow, RedirectSource } from './types';

export type RedirectInput = {
  fromPath: string;
  toPath: string;
  code?: RedirectCode;
  isActive?: boolean;
  source?: RedirectSource;
  note?: string | null;
};

function toRow(input: RedirectInput) {
  const fromPath = normalizeRedirectPath(input.fromPath);
  if (fromPath === '/') throw new Error('Cannot redirect the home page');
  return {
    from_path: fromPath,
    to_path: input.toPath.trim(),
    code: input.code ?? 301,
    is_active: input.isActive ?? true,
    source: input.source ?? 'manual',
    note: input.note ?? null,
  };
}

export async function listRedirects(
  db: DbClient,
  opts: { page?: number; pageSize?: number; search?: string } = {},
): Promise<Paginated<RedirectRow>> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 100;
  const { from, to } = pageRange(page, pageSize);
  let query = db.from('redirects').select('*', { count: 'exact' }).order('from_path').range(from, to);
  if (opts.search) query = query.ilike('from_path', `%${opts.search}%`);
  const result = await query;
  return { items: unwrap(result), total: result.count ?? 0, page, pageSize };
}

/** Insert or update by from_path (normalized). Staff or service role. */
export async function upsertRedirect(db: DbClient, input: RedirectInput): Promise<RedirectRow> {
  return unwrap(
    await db.from('redirects').upsert(toRow(input), { onConflict: 'from_path' }).select('*').single(),
  );
}

/** Bulk import (e.g. WP Redirection export). Returns the number of rows written. */
export async function bulkUpsertRedirects(db: DbClient, inputs: RedirectInput[]): Promise<number> {
  const rows = new Map<string, ReturnType<typeof toRow>>();
  for (const input of inputs) {
    const row = toRow(input);
    rows.set(row.from_path, row); // last one wins on duplicates
  }
  const all = Array.from(rows.values());
  for (let i = 0; i < all.length; i += 500) {
    check(await db.from('redirects').upsert(all.slice(i, i + 500), { onConflict: 'from_path' }));
  }
  return all.length;
}

export async function deleteRedirect(db: DbClient, id: string): Promise<void> {
  check(await db.from('redirects').delete().eq('id', id));
}

/** Every rule, minimal columns (admin redirect planning). */
export async function listAllRedirectsLite(
  db: DbClient,
): Promise<Array<Pick<RedirectRow, 'id' | 'from_path' | 'to_path' | 'is_active'>>> {
  const out: Array<Pick<RedirectRow, 'id' | 'from_path' | 'to_path' | 'is_active'>> = [];
  for (let from = 0; ; from += 1000) {
    const rows = unwrap(
      await db.from('redirects').select('id, from_path, to_path, is_active').order('from_path').range(from, from + 999),
    );
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function updateRedirectTarget(db: DbClient, id: string, toPath: string): Promise<void> {
  check(await db.from('redirects').update({ to_path: toPath }).eq('id', id));
}

/** Update a rule in place (its from_path may change). */
export async function updateRedirect(db: DbClient, id: string, input: RedirectInput): Promise<RedirectRow> {
  return unwrap(await db.from('redirects').update(toRow(input)).eq('id', id).select('*').single());
}
