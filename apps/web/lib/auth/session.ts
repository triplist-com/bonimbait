import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { isConstructionStage, isRegionSlug } from '@/lib/constants/community';
import type { ProfileRow, Role } from '@/lib/db/types';
import { hasRole, isAdminEmail } from './roles';

export type Profile = ProfileRow;

/**
 * The verified current user (validated against Supabase Auth, not just the
 * cookie). Null when signed out or when Supabase is not configured.
 * Memoized per request.
 */
export const getUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

function fallbackProfile(user: User): Profile {
  const now = new Date().toISOString();
  return {
    id: user.id,
    email: user.email ?? null,
    full_name: null,
    phone: null,
    role: 'member',
    construction_stage: null,
    region_id: null,
    whatsapp_opt_in: false,
    avatar_url: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * The current user's profile, or null when signed out. Memoized per request.
 *
 * ADMIN_EMAILS users always get role 'admin' here; if the stored role differs
 * it is promoted in the DB (requires SUPABASE_SERVICE_ROLE_KEY so that RLS
 * also recognizes them as admin).
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  let profile: Profile | null = data;

  const shouldBeAdmin = isAdminEmail(user.email);
  if (!profile || (shouldBeAdmin && profile.role !== 'admin')) {
    profile = (await syncProfile(user)) ?? profile;
  }

  const resolved = profile ?? fallbackProfile(user);
  return shouldBeAdmin ? { ...resolved, role: 'admin' } : resolved;
});

/**
 * Server Component / Server Action guard. Redirects to /login/ when signed
 * out, or to /login/?error=forbidden when the role is insufficient.
 *
 * @param nextPath where to return after login (defaults to '/').
 */
export async function requireRole(role: Role, nextPath = '/'): Promise<Profile> {
  const profile = await getProfile();
  const next = encodeURIComponent(nextPath);
  if (!profile) redirect(`/login/?next=${next}`);
  if (!hasRole(profile.role, role)) redirect(`/login/?next=${next}&error=forbidden`);
  return profile;
}

/** Route Handler guard: returns the profile or an HTTP status to send. */
export async function checkRole(
  role: Role,
): Promise<{ ok: true; profile: Profile } | { ok: false; status: 401 | 403 }> {
  const profile = await getProfile();
  if (!profile) return { ok: false, status: 401 };
  if (!hasRole(profile.role, role)) return { ok: false, status: 403 };
  return { ok: true, profile };
}

/**
 * Ensure a profile row exists and ADMIN_EMAILS users hold the admin role.
 * Uses the service-role client; returns null if it is not configured.
 */
export async function syncProfile(user: User): Promise<Profile | null> {
  if (!isServiceRoleConfigured()) return null;
  const admin = createAdminClient();
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;

  await admin
    .from('profiles')
    .upsert({ id: user.id, email: user.email ?? null, full_name: name }, { onConflict: 'id', ignoreDuplicates: true });

  if (isAdminEmail(user.email)) {
    await admin.from('profiles').update({ role: 'admin' }).eq('id', user.id).neq('role', 'admin');
  }

  const { data } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}

/**
 * Fill onboarding fields collected before an OAuth redirect (Google signup)
 * without overwriting values the member already set. Runs as the user (RLS).
 */
export async function applySignupExtras(
  userId: string,
  extras: { stage?: string | null; region?: string | null },
): Promise<void> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('construction_stage, region_id')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return;

  const update: { construction_stage?: ProfileRow['construction_stage']; region_id?: string } = {};
  if (!profile.construction_stage && isConstructionStage(extras.stage)) {
    update.construction_stage = extras.stage;
  }
  if (!profile.region_id && isRegionSlug(extras.region)) {
    const { data: region } = await supabase.from('regions').select('id').eq('slug', extras.region).maybeSingle();
    if (region) update.region_id = region.id;
  }
  if (Object.keys(update).length > 0) {
    await supabase.from('profiles').update(update).eq('id', userId);
  }
}
