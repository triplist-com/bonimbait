'use server';

import { getLeadById, updateLead, updateLeadStatus } from '@/lib/db/leads';
import type { LeadStatus } from '@/lib/db/types';
import { ActionError, adminAction } from '../guard';
import { optStr } from '../form';
import { LEAD_STATUS_ORDER } from '../labels';

export const setLeadStatus = adminAction('editor', async ({ db }, id: string, status: LeadStatus) => {
  if (!(LEAD_STATUS_ORDER as readonly string[]).includes(status)) throw new ActionError('סטטוס לא חוקי');
  const lead = await getLeadById(db, id);
  if (!lead) throw new ActionError('הליד לא נמצא');
  await updateLeadStatus(db, id, status);
  return { ok: true, message: 'הסטטוס עודכן.' };
});

export const saveLeadNotes = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = optStr(fd, 'id');
  if (!id) throw new ActionError('הליד לא נמצא');
  await updateLead(db, id, { notes: optStr(fd, 'notes', 10_000) });
  return { ok: true, message: 'ההערות נשמרו.' };
});
