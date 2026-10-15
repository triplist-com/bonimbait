'use server';

/**
 * Consult queue quick actions (editors and up). The write runs with the staff
 * member's own session (adminAction), so RLS is a second check; the leads
 * triggers log the status change (command center) and keep revenue fields safe.
 */
import { revalidatePath } from 'next/cache';
import { ActionError, adminAction } from '@/lib/admin/guard';
import type { Json } from '@/lib/db/types';
import { asRevenueDb } from '../db';
import { applyConsultAction, CONSULT_ACTIONS, isConsultAction, type ConsultAction } from '../consult-workflow';

export const runConsultAction = adminAction('editor', async ({ db }, id: string, action: ConsultAction) => {
  if (!isConsultAction(action)) throw new ActionError('פעולה לא מוכרת');
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ActionError('הליד לא נמצא');
  const rdb = asRevenueDb(db);
  const { data: lead, error } = await rdb.from('leads').select('id, type, status, booked_at, payload').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead || lead.type !== 'consultation') throw new ActionError('הליד לא נמצא');

  const now = new Date();
  const next = applyConsultAction(lead, action, now);
  const patch: { status: typeof next.status; booked_at: string | null; payload?: Json } = { status: next.status, booked_at: next.booked_at };
  const payload = lead.payload && typeof lead.payload === 'object' && !Array.isArray(lead.payload) ? lead.payload : {};
  if (action === 'book' && !lead.booked_at) patch.payload = { ...payload, booking: { method: 'phone', at: now.toISOString() } };
  if (action === 'requeue' && 'booking' in payload) {
    const rest = { ...payload };
    delete rest.booking;
    patch.payload = rest;
  }
  const res = await rdb.from('leads').update(patch).eq('id', id);
  if (res.error) throw new Error(res.error.message);
  revalidatePath('/admin/consult-queue/');
  return { ok: true, message: CONSULT_ACTIONS[action].done };
});
