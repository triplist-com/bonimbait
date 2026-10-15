'use server';

/**
 * Bonim.Os admin (/admin/bonimos/): the manager roster, turning a client's
 * hub project into a managed project, and assigning managers. Admin only.
 *
 * These writes need the SERVICE ROLE on purpose: the hub lets nobody add
 * project members or change a project's mode through the API
 * (20261014121000_hub_core.sql). adminAction() checks the admin role first;
 * every database trigger (activity log, guards) still runs.
 */
import { revalidatePath } from 'next/cache';
import { trackServer } from '@/lib/analytics/server';
import { defaultProjectTitle } from '@/lib/hub/onboarding';
import { findAccountByEmail } from '@/lib/bonimos/admin';
import { bonimosAdminDb } from '@/lib/bonimos/db';
import { ActionError, adminAction } from '../guard';
import { bool, optStr, str, uuidOrNull } from '../form';

function refresh(): void {
  revalidatePath('/admin/bonimos/');
  revalidatePath('/manage', 'layout');
  revalidatePath('/my-home', 'layout');
}

const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}$/;

function rosterFields(fd: FormData) {
  const displayName = str(fd, 'display_name', 80);
  if (displayName.length < 2) throw new ActionError('כתבו את השם שהלקוחות יראו.', { display_name: 'חובה' });
  const title = optStr(fd, 'title', 60) ?? 'מנהל/ת פרויקט';
  if (title.length < 2) throw new ActionError('התפקיד קצר מדי.', { title: 'למשל: מנהלת פרויקט' });
  const phone = optStr(fd, 'phone', 20);
  if (phone && !PHONE_RE.test(phone)) throw new ActionError('מספר הטלפון לא תקין.', { phone: 'למשל 050-1234567' });
  return { display_name: displayName, title, phone };
}

/** Add an existing account to the team of project managers (or update it). */
export const addBonimosManager = adminAction('admin', async ({ profile }, fd: FormData) => {
  const fields = rosterFields(fd);
  const account = await findAccountByEmail(str(fd, 'email', 200));
  if (!account) throw new ActionError('לא מצאנו חשבון עם המייל הזה. בקשו מהמנהל להירשם לאתר, ואז הוסיפו אותו.', { email: 'אין חשבון כזה' });
  const { error } = await bonimosAdminDb()
    .from('bonimos_managers')
    .upsert({ user_id: account.id, ...fields, active: true, created_by: profile.id }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  refresh();
  return { ok: true, message: `${fields.display_name} בצוות הליווי. אפשר לשבץ ללקוחות.` };
});

export const updateBonimosManager = adminAction('admin', async (_ctx, userId: string, fd: FormData) => {
  const id = uuidOrNull(userId);
  if (!id) throw new ActionError('מנהל לא נמצא.');
  const fields = rosterFields(fd);
  const { error } = await bonimosAdminDb()
    .from('bonimos_managers')
    .update({ ...fields, active: bool(fd, 'active') })
    .eq('user_id', id);
  if (error) throw new Error(error.message);
  refresh();
  return { ok: true, message: 'הפרטים עודכנו.' };
});

/** Remove from the team: every assignment ends too (the projects keep their history). */
export const removeBonimosManager = adminAction('admin', async (_ctx, userId: string) => {
  const id = uuidOrNull(userId);
  if (!id) throw new ActionError('מנהל לא נמצא.');
  const db = bonimosAdminDb();
  const { error: membersError } = await db.from('hub_project_members').delete().eq('user_id', id).eq('role', 'manager');
  if (membersError) throw new Error(membersError.message);
  const { error } = await db.from('bonimos_managers').delete().eq('user_id', id);
  if (error) throw new Error(error.message);
  refresh();
  return { ok: true, message: 'המנהל הוסר מהצוות ומכל הפרויקטים.' };
});

async function assign(projectId: string, managerId: string, addedBy: string): Promise<void> {
  const db = bonimosAdminDb();
  const [{ data: manager }, { data: project }] = await Promise.all([
    db.from('bonimos_managers').select('user_id, active').eq('user_id', managerId).maybeSingle(),
    db.from('hub_projects').select('id, created_by, mode').eq('id', projectId).maybeSingle(),
  ]);
  if (!manager || !(manager as { active: boolean }).active) throw new ActionError('בחרו מנהל פעיל מהצוות.', { manager_id: 'חובה' });
  const p = project as { id: string; created_by: string; mode: string } | null;
  if (!p) throw new ActionError('הפרויקט לא נמצא.');
  if (p.created_by === managerId) throw new ActionError('הלקוח לא יכול לנהל את הפרויקט של עצמו.');
  if (p.mode !== 'managed') throw new ActionError('הפרויקט עוד לא בליווי.');
  const { error } = await db
    .from('hub_project_members')
    .upsert({ project_id: projectId, user_id: managerId, role: 'manager', added_by: addedBy }, { onConflict: 'project_id,user_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await trackServer('bonimos_manager_assigned', { project_id: projectId, action: 'assigned' }, { userId: addedBy });
}

/**
 * A client joins Bonim.Os: their hub project (the newest active one, or a
 * new one) switches to managed mode, optionally with a first manager. The
 * hub they already use stays exactly as it was: same project, same data.
 */
export const startBonimosClient = adminAction('admin', async ({ profile }, fd: FormData) => {
  const account = await findAccountByEmail(str(fd, 'email', 200));
  if (!account) throw new ActionError('לא מצאנו חשבון עם המייל הזה. הלקוח צריך להירשם לאתר קודם (הרשמה בחינם).', { email: 'אין חשבון כזה' });
  const managerId = uuidOrNull(optStr(fd, 'manager_id'));
  const db = bonimosAdminDb();
  const { data: existing } = await db
    .from('hub_projects')
    .select('id, mode')
    .eq('created_by', account.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let projectId = (existing as { id: string } | null)?.id ?? null;
  if (!projectId) {
    const { data, error } = await db
      .from('hub_projects')
      .insert({ created_by: account.id, title: defaultProjectTitle(account.full_name), source: 'bonimos' })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'create failed');
    projectId = (data as { id: string }).id;
  }
  if ((existing as { mode: string } | null)?.mode !== 'managed') {
    const { error } = await db.from('hub_projects').update({ mode: 'managed' }).eq('id', projectId);
    if (error) throw new Error(error.message);
  }
  if (managerId) await assign(projectId, managerId, profile.id);
  refresh();
  return { ok: true, message: `הפרויקט של ${account.full_name || account.email} בליווי ב-Bonim.Os${managerId ? ', עם מנהל פרויקט' : ''}.` };
});

export const assignBonimosManager = adminAction('admin', async ({ profile }, projectId: string, fd: FormData) => {
  const id = uuidOrNull(projectId);
  const managerId = uuidOrNull(optStr(fd, 'manager_id'));
  if (!id) throw new ActionError('הפרויקט לא נמצא.');
  if (!managerId) throw new ActionError('בחרו מנהל מהצוות.', { manager_id: 'חובה' });
  await assign(id, managerId, profile.id);
  refresh();
  return { ok: true, message: 'המנהל שובץ לפרויקט.' };
});

export const unassignBonimosManager = adminAction('admin', async ({ profile }, projectId: string, fd: FormData) => {
  const id = uuidOrNull(projectId);
  const managerId = uuidOrNull(optStr(fd, 'manager_id'));
  if (!id || !managerId) throw new ActionError('השיבוץ לא נמצא.');
  const { error } = await bonimosAdminDb().from('hub_project_members').delete().eq('project_id', id).eq('user_id', managerId).eq('role', 'manager');
  if (error) throw new Error(error.message);
  await trackServer('bonimos_manager_assigned', { project_id: id, action: 'removed' }, { userId: profile.id });
  refresh();
  return { ok: true, message: 'המנהל הוסר מהפרויקט.' };
});

/** The managed plan ended: managers leave, the client keeps the hub and all the history. */
export const endBonimosClient = adminAction('admin', async (_ctx, projectId: string) => {
  const id = uuidOrNull(projectId);
  if (!id) throw new ActionError('הפרויקט לא נמצא.');
  const db = bonimosAdminDb();
  const { error: membersError } = await db.from('hub_project_members').delete().eq('project_id', id).eq('role', 'manager');
  if (membersError) throw new Error(membersError.message);
  const { error } = await db.from('hub_projects').update({ mode: 'self' }).eq('id', id);
  if (error) throw new Error(error.message);
  refresh();
  return { ok: true, message: 'הליווי הסתיים. הלקוח ממשיך עם הבית שלי, וכל ההיסטוריה נשמרת.' };
});
