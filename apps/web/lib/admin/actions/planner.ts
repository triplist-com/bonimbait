'use server';

/**
 * Budget planner price book (/admin/planner/): every save inserts a new
 * version into planner_price_book (append-only; RLS: staff insert as
 * themselves) and refreshes the planner pages.
 */
import { revalidatePath } from 'next/cache';
import type { Json } from '@/lib/db/types';
import { asPlannerDb } from '@/lib/planner/db-types';
import { validatePriceBook } from '@/lib/planner/schema';
import { ActionError, adminAction } from '../guard';
import { jsonField, optStr } from '../form';

const PLANNER_PATHS = ['/calculator/', '/calculator', '/api/planner/price-book'];

function revalidatePlanner(): void {
  for (const p of PLANNER_PATHS) revalidatePath(p);
  revalidatePath('/calculator/[slug]', 'page');
}

export const savePriceBook = adminAction('editor', async ({ db, profile }, fd: FormData) => {
  const candidate = jsonField<unknown>(fd, 'book', null);
  if (!candidate) throw new ActionError('לא התקבלו נתוני מחירון');
  const res = validatePriceBook(candidate);
  if (!res.ok) {
    const fieldErrors = Object.fromEntries(res.issues.slice(0, 6).map((i) => [i.path || '_form', i.message]));
    throw new ActionError(res.issues[0]?.message ?? 'המחירון לא תקין', fieldErrors);
  }
  const { error } = await asPlannerDb(db)
    .from('planner_price_book')
    .insert({
      valid_as_of: res.book.validAsOf,
      data: res.book as unknown as Json,
      note: optStr(fd, 'note', 500),
      created_by: profile.id,
    });
  if (error) throw new Error(error.message);
  revalidatePlanner();
  return { ok: true, message: 'המחירון נשמר כגרסה חדשה. המחשבון והתרחישים מתעדכנים עכשיו.' };
});
