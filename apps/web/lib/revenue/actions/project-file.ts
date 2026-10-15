'use server';

/**
 * The signed-in member's project file, for the booking sheet to SHOW before
 * they book: a member's answers live in their hub project (the hub moves the
 * browser's draft into the account on login), so the browser alone would show
 * an empty file. Reads only the session's own member id; null for visitors.
 * The stored lead does not depend on this: the server merges the same
 * snapshot again (lib/project-file/server.ts).
 */
import { getProfile, getUser } from '@/lib/auth/session';
import { loadMemberProjectSnapshot } from '@/lib/project-file/hub-adapter';
import type { ProjectFile } from '@/lib/project-file/types';

export async function loadMyProjectFile(): Promise<ProjectFile | null> {
  try {
    const user = await getUser();
    return user ? await loadMemberProjectSnapshot(user.id) : null;
  } catch {
    return null;
  }
}

export type BookingContact = { fullName?: string; phone?: string; email?: string };
export type BookingDefaults = { file: ProjectFile | null; contact: BookingContact | null };

/**
 * What the booking sheet can fill in for a signed-in member: their project
 * file and their own contact details (profile name and phone, account email),
 * so booking is one tap. Only ever the session's own member; nothing for
 * visitors. Never throws.
 */
export async function loadMyBookingDefaults(): Promise<BookingDefaults> {
  try {
    const user = await getUser();
    if (!user) return { file: null, contact: null };
    const [file, profile] = await Promise.all([loadMemberProjectSnapshot(user.id), getProfile().catch(() => null)]);
    const contact: BookingContact = {};
    if (profile?.full_name?.trim()) contact.fullName = profile.full_name.trim();
    if (profile?.phone?.trim()) contact.phone = profile.phone.trim();
    const email = profile?.email || user.email;
    if (email) contact.email = email;
    return { file, contact: Object.keys(contact).length ? contact : null };
  } catch {
    return { file: null, contact: null };
  }
}
