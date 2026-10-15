import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@/lib/db/types';

const state = vi.hoisted(() => ({
  profile: null as null | { id: string; email: string; role: Role },
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  revalidated: [] as string[],
  insertError: null as null | { message: string },
}));

vi.mock('@/lib/auth/session', () => ({ getProfile: async () => state.profile }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return { error: state.insertError };
      },
    }),
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => state.revalidated.push(p) }));

import { savePriceBook } from '@/lib/admin/actions/planner';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import type { PriceBook } from '@/lib/planner/types';

function form(book: unknown, note = 'עדכון שלד'): FormData {
  const fd = new FormData();
  fd.set('book', JSON.stringify(book));
  fd.set('note', note);
  return fd;
}

beforeEach(() => {
  state.profile = { id: '54b134fa-a6dc-44b9-b3bf-51097ab15b79', email: 'editor@bonimbait.test', role: 'editor' };
  state.inserts = [];
  state.revalidated = [];
  state.insertError = null;
});

describe('savePriceBook', () => {
  it('saves a valid book as a new version, as the editor, and refreshes the planner', async () => {
    const book: PriceBook = JSON.parse(JSON.stringify(DEFAULT_PRICE_BOOK));
    book.finishLevels.standard.perM2Agorot = 1_350_000;
    book.validAsOf = '2026-11-01';
    const res = await savePriceBook(form(book));
    expect(res.ok).toBe(true);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].table).toBe('planner_price_book');
    expect(state.inserts[0].row).toMatchObject({ valid_as_of: '2026-11-01', note: 'עדכון שלד', created_by: state.profile!.id });
    expect((state.inserts[0].row.data as PriceBook).finishLevels.standard.perM2Agorot).toBe(1_350_000);
    expect(state.revalidated).toEqual(expect.arrayContaining(['/calculator/', '/calculator/[slug]']));
  });

  it('refuses an invalid book with a Hebrew message and never writes', async () => {
    const book: PriceBook = JSON.parse(JSON.stringify(DEFAULT_PRICE_BOOK));
    book.stageSplitPct.frame = 50;
    const res = await savePriceBook(form(book));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('100%');
    expect(state.inserts).toHaveLength(0);
  });

  it('refuses members and signed-out visitors', async () => {
    state.profile = { id: 'm1', email: 'm@bonimbait.test', role: 'member' };
    expect((await savePriceBook(form(DEFAULT_PRICE_BOOK))).ok).toBe(false);
    state.profile = null;
    expect((await savePriceBook(form(DEFAULT_PRICE_BOOK))).ok).toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it('reports a DB refusal (RLS) without crashing', async () => {
    state.insertError = { message: 'new row violates row-level security policy' };
    const res = await savePriceBook(form(DEFAULT_PRICE_BOOK));
    expect(res.ok).toBe(false);
  });
});
