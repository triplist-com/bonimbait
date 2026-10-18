'use server';

/**
 * Routing rules editor (admins). Writes run with the admin's session (RLS:
 * staff full access); the instance's rule cache is dropped so the next lead
 * uses the new rules at once (other instances refresh within a minute).
 */
import { revalidatePath } from 'next/cache';
import { ActionError, adminAction } from '@/lib/admin/guard';
import { str } from '@/lib/admin/form';
import { asRevenueDb } from '../db';
import { invalidateRoutingRules } from '../routing-server';
import { parseRuleForm, type RuleFormValues } from '../routing-form';

const PATH = '/admin/lead-routing/';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(fd: FormData, name: string): string[] {
  return fd.getAll(name).filter((v): v is string => typeof v === 'string');
}

export const saveRoutingRule = adminAction('admin', async ({ db, profile }, fd: FormData) => {
  const values: RuleFormValues = {
    name: str(fd, 'name', 200),
    is_active: str(fd, 'is_active', 10),
    priority: str(fd, 'priority', 10),
    lead_types: list(fd, 'lead_types'),
    specialty_slugs: list(fd, 'specialty_slugs'),
    region_slugs: list(fd, 'region_slugs'),
    stages: list(fd, 'stages'),
    min_score: str(fd, 'min_score', 5),
    max_score: str(fd, 'max_score', 5),
    target: str(fd, 'target', 40),
    target_business_id: str(fd, 'target_business_id', 64),
    target_campaign_id: str(fd, 'target_campaign_id', 64),
    note: str(fd, 'note', 600),
  };
  const parsed = parseRuleForm(values);
  if (!parsed.ok) throw new ActionError('נא לתקן את השדות המסומנים', parsed.fieldErrors);

  const rdb = asRevenueDb(db);
  const id = str(fd, 'id', 64);
  if (id) {
    if (!UUID_RE.test(id)) throw new ActionError('הכלל לא נמצא');
    const res = await rdb.from('lead_routing_rules').update(parsed.rule).eq('id', id).select('id').maybeSingle();
    if (res.error) throw new Error(res.error.message);
    if (!res.data) throw new ActionError('הכלל לא נמצא');
  } else {
    const res = await rdb.from('lead_routing_rules').insert({ ...parsed.rule, created_by: profile.id });
    if (res.error) throw new Error(res.error.message);
  }
  invalidateRoutingRules();
  revalidatePath(PATH);
  return { ok: true, message: 'הכלל נשמר.', data: { redirect: PATH } };
});

export const setRoutingRuleActive = adminAction('admin', async ({ db }, id: string, active: boolean) => {
  if (!UUID_RE.test(id)) throw new ActionError('הכלל לא נמצא');
  const res = await asRevenueDb(db).from('lead_routing_rules').update({ is_active: Boolean(active) }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
  invalidateRoutingRules();
  revalidatePath(PATH);
  return { ok: true, message: active ? 'הכלל הופעל.' : 'הכלל הושבת.' };
});

export const deleteRoutingRule = adminAction('admin', async ({ db }, id: string) => {
  if (!UUID_RE.test(id)) throw new ActionError('הכלל לא נמצא');
  const res = await asRevenueDb(db).from('lead_routing_rules').delete().eq('id', id);
  if (res.error) throw new Error(res.error.message);
  invalidateRoutingRules();
  revalidatePath(PATH);
  return { ok: true, message: 'הכלל נמחק.', data: { redirect: PATH } };
});
