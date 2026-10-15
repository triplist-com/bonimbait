'use server';

import { revalidatePath } from 'next/cache';
import type { CommandDb } from '@/lib/command/db';
import type { DbClient } from '@/lib/db/client';
import { defaultExpectedValues, parseExpectedValueInput, sameAsDefault, typicalPlanPrice } from '@/lib/command/pipeline';
import type { PlanFact } from '@/lib/command/types';
import { ActionError, adminAction } from '../guard';
import { str } from '../form';

/**
 * Command Center settings. Admin only (the owner's business assumptions); RLS
 * on pipeline_expected_values enforces it again (is_admin()).
 */

async function plansFor(db: DbClient): Promise<PlanFact[]> {
  const { data, error } = await db
    .from('service_plans')
    .select('slug, name, sort_order, service_plan_prices(price_agorot, vat_included)')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    slug: p.slug,
    name: p.name,
    sortOrder: p.sort_order,
    priceAgorot: typicalPlanPrice(p.service_plan_prices ?? []),
  }));
}

/** Save the expected-value table: rows equal to their default drop their override. */
export const saveExpectedValues = adminAction('admin', async ({ db, profile }, fd: FormData) => {
  const cdb = db as unknown as CommandDb;
  const defaults = defaultExpectedValues(await plansFor(db));
  const fieldErrors: Record<string, string> = {};
  const upserts: { key: string; deal_value_agorot: number; close_rate: number; updated_by: string }[] = [];
  const resets: string[] = [];
  for (const def of defaults) {
    const parsed = parseExpectedValueInput({ deal: str(fd, `deal:${def.key}`, 40), rate: str(fd, `rate:${def.key}`, 20) });
    if (!parsed.ok) {
      fieldErrors[def.key] = `${def.label}: ${parsed.error}`;
      continue;
    }
    if (sameAsDefault(def, parsed)) resets.push(def.key);
    else upserts.push({ key: def.key, deal_value_agorot: parsed.dealValueAgorot, close_rate: parsed.closeRate, updated_by: profile.id });
  }
  if (Object.keys(fieldErrors).length > 0) throw new ActionError('יש ערכים לא תקינים', fieldErrors);
  if (upserts.length > 0) {
    const { error } = await cdb.from('pipeline_expected_values').upsert(upserts, { onConflict: 'key' });
    if (error) throw new Error(error.message);
  }
  if (resets.length > 0) {
    const { error } = await cdb.from('pipeline_expected_values').delete().in('key', resets);
    if (error) throw new Error(error.message);
  }
  revalidatePath('/admin/');
  revalidatePath('/admin/insights/pipeline/');
  return { ok: true, message: upserts.length ? `נשמר. ${upserts.length} ערכים שונים מברירת המחדל.` : 'נשמר. כל הערכים לפי ברירת המחדל.' };
});

/** Back to the defaults. */
export const resetExpectedValues = adminAction('admin', async ({ db }) => {
  const { error } = await (db as unknown as CommandDb).from('pipeline_expected_values').delete().like('key', '%:%');
  if (error) throw new Error(error.message);
  revalidatePath('/admin/');
  revalidatePath('/admin/insights/pipeline/');
  return { ok: true, message: 'הערכים חזרו לברירת המחדל.' };
});
