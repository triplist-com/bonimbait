import 'server-only';

/**
 * The admin side of Bonim.Os (/admin/bonimos/): the manager roster and the
 * managed projects, read with the SERVICE ROLE. Callers must have checked
 * requireRole('admin') / authorize('admin') first.
 *
 * Deliberately shallow: who the client is, the project's title, stage and
 * region, and who manages it. That is what an admin needs to assign
 * managers. Budgets, documents, photos and approvals stay visible to the
 * project's members only (the hub's rule: staff see aggregates, not files).
 */
import { bonimosAdminDb } from './db';
import type { BonimosManagerRow } from './types';

export interface RosterEntry {
  userId: string;
  displayName: string;
  title: string;
  phone: string | null;
  active: boolean;
  email: string | null;
  projectCount: number;
}

export interface AdminManagedProject {
  id: string;
  title: string;
  stage: string | null;
  regionName: string | null;
  sizeM2: number | null;
  clientId: string;
  clientName: string | null;
  clientEmail: string | null;
  managers: Array<{ userId: string; name: string }>;
  updatedAt: string;
}

export interface BonimosAdminData {
  roster: RosterEntry[];
  projects: AdminManagedProject[];
}

type ProfileLite = { id: string; email: string | null; full_name: string | null };

export async function loadBonimosAdmin(): Promise<BonimosAdminData> {
  const db = bonimosAdminDb();
  const [rosterRes, projectsRes] = await Promise.all([
    db.from('bonimos_managers').select('*').order('display_name', { ascending: true }),
    db
      .from('hub_projects')
      .select('id, title, stage, region_id, size_m2, created_by, updated_at')
      .eq('mode', 'managed')
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(500),
  ]);
  if (rosterRes.error) throw new Error(`[bonimos] roster: ${rosterRes.error.message}`);
  if (projectsRes.error) throw new Error(`[bonimos] managed projects: ${projectsRes.error.message}`);
  const roster = (rosterRes.data ?? []) as BonimosManagerRow[];
  const projects = (projectsRes.data ?? []) as Array<{
    id: string;
    title: string | null;
    stage: string | null;
    region_id: string | null;
    size_m2: number | null;
    created_by: string;
    updated_at: string;
  }>;
  const projectIds = projects.map((p) => p.id);

  const [membersRes, assignedRes] = await Promise.all([
    projectIds.length
      ? db.from('hub_project_members').select('project_id, user_id').in('project_id', projectIds).eq('role', 'manager')
      : Promise.resolve({ data: [], error: null }),
    roster.length
      ? db.from('hub_project_members').select('user_id').eq('role', 'manager').in('user_id', roster.map((r) => r.user_id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const members = (membersRes.data ?? []) as Array<{ project_id: string; user_id: string }>;
  const people = new Set<string>([...roster.map((r) => r.user_id), ...projects.map((p) => p.created_by), ...members.map((m) => m.user_id)]);
  const [{ data: profiles }, { data: regions }] = await Promise.all([
    people.size ? db.from('profiles').select('id, email, full_name').in('id', Array.from(people)) : Promise.resolve({ data: [] }),
    db.from('regions').select('id, name'),
  ]);
  const profileById = new Map(((profiles ?? []) as ProfileLite[]).map((p) => [p.id, p]));
  const regionById = new Map(((regions ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]));
  const rosterById = new Map(roster.map((r) => [r.user_id, r]));
  const counts = new Map<string, number>();
  for (const m of (assignedRes.data ?? []) as Array<{ user_id: string }>) counts.set(m.user_id, (counts.get(m.user_id) ?? 0) + 1);

  return {
    roster: roster.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      title: r.title,
      phone: r.phone,
      active: r.active,
      email: profileById.get(r.user_id)?.email ?? null,
      projectCount: counts.get(r.user_id) ?? 0,
    })),
    projects: projects.map((p) => {
      const client = profileById.get(p.created_by);
      return {
        id: p.id,
        title: p.title ?? 'פרויקט בליווי',
        stage: p.stage,
        regionName: p.region_id ? regionById.get(p.region_id) ?? null : null,
        sizeM2: p.size_m2,
        clientId: p.created_by,
        clientName: client?.full_name ?? null,
        clientEmail: client?.email ?? null,
        managers: members
          .filter((m) => m.project_id === p.id)
          .map((m) => ({
            userId: m.user_id,
            name: rosterById.get(m.user_id)?.display_name ?? profileById.get(m.user_id)?.full_name ?? profileById.get(m.user_id)?.email ?? 'מנהל',
          })),
        updatedAt: p.updated_at,
      };
    }),
  };
}

/** An account by exact email (case-insensitive). */
export async function findAccountByEmail(email: string): Promise<ProfileLite | null> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return null;
  const { data } = await bonimosAdminDb().from('profiles').select('id, email, full_name').ilike('email', clean.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(2);
  const rows = (data ?? []) as ProfileLite[];
  return rows.find((r) => r.email?.toLowerCase() === clean) ?? null;
}
