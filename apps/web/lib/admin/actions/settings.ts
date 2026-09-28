'use server';

import { setMemberRole } from '@/lib/db/members';
import { deleteRedirect, updateRedirect, upsertRedirect } from '@/lib/db/redirects';
import type { RedirectCode, Role } from '@/lib/db/types';
import { normalizeRedirectPath } from '@/lib/redirects/normalize';
import { ActionError, adminAction } from '../guard';
import { bool, optStr, requireField, str, uuidOrNull } from '../form';
import { testRedirect as runRedirectTest, type RedirectTestResult } from '../redirects';

const ROLES: Role[] = ['member', 'pro', 'editor', 'admin'];

/** Change a user's role. Admin only (the DB trigger enforces it too). */
export const changeMemberRole = adminAction('admin', async ({ db, profile }, userId: string, fd: FormData) => {
  const role = str(fd, 'role') as Role;
  if (!ROLES.includes(role)) throw new ActionError('תפקיד לא חוקי');
  if (userId === profile.id) throw new ActionError('אי אפשר לשנות את התפקיד של עצמכם.');
  await setMemberRole(db, userId, role);
  return { ok: true, message: 'התפקיד עודכן.' };
});

const CODES: RedirectCode[] = [301, 302, 307, 308];

/** Create or edit a redirect rule. */
export const saveRedirectAction = adminAction('editor', async ({ db }, fd: FormData) => {
  const id = uuidOrNull(optStr(fd, 'id'));
  const fromPath = requireField(str(fd, 'from_path', 1000), 'כתובת מקור', 'from_path');
  const toPath = requireField(str(fd, 'to_path', 2000), 'כתובת יעד', 'to_path');
  if (!fromPath.startsWith('/')) throw new ActionError('כתובת המקור חייבת להתחיל ב-/', { from_path: 'למשל /old-page/' });
  if (!toPath.startsWith('/') && !/^https?:\/\//i.test(toPath)) {
    throw new ActionError('כתובת היעד חייבת להתחיל ב-/ או ב-https://', { to_path: 'לא תקין' });
  }
  if (normalizeRedirectPath(fromPath) === '/') throw new ActionError('אי אפשר להפנות את דף הבית');
  if (toPath.startsWith('/') && normalizeRedirectPath(fromPath) === normalizeRedirectPath(toPath)) {
    throw new ActionError('המקור והיעד זהים (לולאת הפניה)');
  }
  const code = Number(str(fd, 'code')) as RedirectCode;
  if (!CODES.includes(code)) throw new ActionError('קוד הפניה לא חוקי');
  const input = { fromPath, toPath, code, isActive: bool(fd, 'is_active'), note: optStr(fd, 'note', 500) };
  if (id) await updateRedirect(db, id, input);
  else await upsertRedirect(db, input);
  return { ok: true, message: 'ההפניה נשמרה. היא פעילה מיד בבדיקה, ובכל השרתים תוך עד 5 דקות.' };
});

export const removeRedirect = adminAction('editor', async ({ db }, id: string) => {
  await deleteRedirect(db, id);
  return { ok: true, message: 'ההפניה נמחקה.' };
});

/** Request the source path without following redirects (refreshes the middleware cache first). */
export const testRedirectAction = adminAction<[string], RedirectTestResult>('editor', async (_ctx, path: string) => {
  if (!path.startsWith('/')) throw new ActionError('כתובת לא תקינה');
  const encoded = path
    .split('/')
    .map((seg) => encodeURIComponent(decodeURIComponentSafe(seg)))
    .join('/');
  return { ok: true, data: await runRedirectTest(encoded) };
});

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
