import 'server-only';

/**
 * Bonim.Os server layer. Everything runs AS THE SIGNED-IN USER (RLS: project
 * members only), so a manager reads exactly the projects assigned to them and
 * a client exactly their own:
 *
 *   loadManagerWorkspace(user)            /manage/: the assigned projects
 *   loadManagedProject(user, projectId)   /manage/<id>/: the shared project view
 *   loadManagedHubSummary(user, project)  the band on the client's /my-home/
 *
 * Photo URLs are short-lived signed URLs made with the same session.
 */
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { israelToday } from '@/lib/hub/onboarding';
import { PROJECT_COLUMNS } from '@/lib/hub/server';
import { estimateFromProfile } from '@/lib/planner/engine';
import { loadPriceBook } from '@/lib/planner/price-book';
import { planTotal, plannedFromStageRows } from './budget';
import type { HubBudgetItemRow, HubBudgetVersionRow, HubDocumentRow, HubProjectRow } from '@/lib/hub/types';
import { bonimosUserDb, type BonimosDb } from './db';
import {
  activityView,
  budgetItemViews,
  clientNameOf,
  documentView,
  milestoneView,
  paymentViews,
  personView,
  projectSummaryParts,
  toNis,
  versionPlans,
} from './mappers';
import { photosInLastWeek } from './photos';
import type {
  BonimosActivityRow,
  BonimosMilestoneRow,
  BonimosPaymentEventRow,
  BonimosPaymentRequestRow,
  BonimosPersonRow,
  BonimosPhotoRow,
  ManagedHubSummary,
  ManagedProjectData,
  ManagerProjectSummary,
  PhotoView,
  ProjectRole,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PHOTO_URL_TTL_SECONDS = 3600;
const PHOTO_LIMIT = 200;
const ACTIVITY_LIMIT = 150;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[bonimos] ${context}: ${error?.message ?? 'unknown error'}`);
}

/** The caller's role in a project (their own membership row), or null. */
export async function projectRole(db: BonimosDb, projectId: string, userId: string): Promise<ProjectRole | null> {
  if (!isUuid(projectId)) return null;
  const { data, error } = await db
    .from('hub_project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail('role', error);
  return ((data as { role: ProjectRole } | null)?.role ?? null) as ProjectRole | null;
}

/** Projects the user manages (manager memberships). */
export async function managerProjectIds(db: BonimosDb, userId: string): Promise<string[]> {
  const { data, error } = await db.from('hub_project_members').select('project_id').eq('user_id', userId).eq('role', 'manager');
  if (error) fail('assignments', error);
  return (data ?? []).map((r) => (r as { project_id: string }).project_id);
}

/** The user's own managed projects (as the client), newest first. */
export async function clientManagedProjectIds(db: BonimosDb, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from('hub_projects')
    .select('id')
    .eq('created_by', userId)
    .eq('mode', 'managed')
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });
  if (error) fail('client projects', error);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

async function regionNames(db: BonimosDb, ids: Array<string | null>): Promise<Map<string, { slug: string; name: string }>> {
  const wanted = Array.from(new Set(ids.filter((x): x is string => Boolean(x))));
  if (!wanted.length) return new Map();
  const { data } = await db.from('regions').select('id, slug, name').in('id', wanted);
  return new Map((data ?? []).map((r) => [r.id, { slug: r.slug, name: r.name }]));
}

async function people(db: BonimosDb, projectIds: string[]): Promise<BonimosPersonRow[]> {
  if (!projectIds.length) return [];
  const { data, error } = await db.rpc('bonimos_project_people', { p_projects: projectIds });
  if (error) fail('people', error);
  return (data ?? []) as BonimosPersonRow[];
}

async function signPhotos(rows: readonly BonimosPhotoRow[]): Promise<PhotoView[]> {
  if (!rows.length) return [];
  const paths = rows.flatMap((p) => [p.thumb_path, p.storage_path]);
  const { data, error } = await createClient().storage.from('bonimos-photos').createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
  if (error) console.error('[bonimos] photo urls unavailable:', error.message);
  const url = new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]));
  return rows.flatMap((p) => {
    const thumbUrl = url.get(p.thumb_path);
    const full = url.get(p.storage_path);
    if (!thumbUrl || !full) return [];
    return [
      {
        id: p.id,
        url: full,
        thumbUrl,
        width: p.width,
        height: p.height,
        caption: p.caption,
        stage: p.stage,
        takenOn: p.taken_on,
        uploadedBy: p.uploaded_by,
        createdAt: p.created_at,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// The shared project view
// ---------------------------------------------------------------------------

/**
 * Everything /manage/<id>/ renders, or null when the user isn't a member of
 * that managed project (RLS returns nothing, and so do we).
 */
export async function loadManagedProject(user: User, projectId: string): Promise<ManagedProjectData | null> {
  if (!isUuid(projectId)) return null;
  const db = bonimosUserDb();
  const [{ data: projectData, error: projectError }, role] = await Promise.all([
    db.from('hub_projects').select(PROJECT_COLUMNS).eq('id', projectId).maybeSingle(),
    projectRole(db, projectId, user.id),
  ]);
  if (projectError) fail('project', projectError);
  const project = projectData as HubProjectRow | null;
  if (!project || !role || project.mode !== 'managed') return null;

  const [regions, peopleRows, versionsRes, itemsRes, milestonesRes, requestsRes, eventsRes, docsRes, photosRes, activityRes, priceBook] =
    await Promise.all([
      regionNames(db, [project.region_id]),
      people(db, [projectId]),
      db.from('hub_budget_versions').select('*').eq('project_id', projectId).order('version_no', { ascending: true }),
      db.from('hub_budget_items').select('*').eq('project_id', projectId).limit(2000),
      db.from('bonimos_milestones').select('*').eq('project_id', projectId).order('planned_start', { ascending: true }),
      db.from('bonimos_payment_requests').select('*').eq('project_id', projectId).order('number', { ascending: false }),
      db.from('bonimos_payment_events').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(3000),
      db.from('hub_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      db
        .from('bonimos_photos')
        .select('*')
        .eq('project_id', projectId)
        .order('taken_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(PHOTO_LIMIT),
      db.from('bonimos_activity').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(ACTIVITY_LIMIT),
      loadPriceBook(),
    ]);
  for (const [label, res] of [
    ['versions', versionsRes],
    ['items', itemsRes],
    ['milestones', milestonesRes],
    ['payments', requestsRes],
    ['payment events', eventsRes],
    ['documents', docsRes],
    ['photos', photosRes],
    ['activity', activityRes],
  ] as const) {
    if (res.error) fail(label, res.error);
  }

  const items = (itemsRes.data ?? []) as HubBudgetItemRow[];
  const documents = (docsRes.data ?? []) as HubDocumentRow[];
  const region = project.region_id ? regions.get(project.region_id) ?? null : null;
  const baselinePlan = project.size_m2
    ? plannedFromStageRows(estimateFromProfile({ sizeM2: project.size_m2, regionSlug: region?.slug }, priceBook.book).stages)
    : null;
  const budgetRange: [number, number] | null =
    project.budget_min_agorot != null && project.budget_max_agorot != null
      ? [toNis(project.budget_min_agorot), toNis(project.budget_max_agorot)]
      : null;

  return {
    mode: 'member',
    viewer: { userId: user.id, role },
    today: israelToday(),
    now: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title ?? 'פרויקט בליווי',
      stage: project.stage,
      regionSlug: region?.slug ?? null,
      regionName: region?.name ?? null,
      sizeM2: project.size_m2,
      targetMoveIn: project.target_move_in ? project.target_move_in.slice(0, 7) : null,
      budgetRangeNis: budgetRange,
      mode: project.mode,
    },
    people: peopleRows.map(personView),
    versions: versionPlans((versionsRes.data ?? []) as HubBudgetVersionRow[], items),
    budgetItems: budgetItemViews(items),
    milestones: ((milestonesRes.data ?? []) as BonimosMilestoneRow[]).map(milestoneView),
    payments: paymentViews(
      (requestsRes.data ?? []) as BonimosPaymentRequestRow[],
      (eventsRes.data ?? []) as BonimosPaymentEventRow[],
      documents,
    ),
    documents: documents.map(documentView),
    photos: await signPhotos((photosRes.data ?? []) as BonimosPhotoRow[]),
    activity: ((activityRes.data ?? []) as BonimosActivityRow[]).map(activityView),
    baseline: baselinePlan ? { plan: baselinePlan, total: planTotal(baselinePlan), validAsOf: priceBook.book.validAsOf } : null,
  };
}

// ---------------------------------------------------------------------------
// The manager's workspace
// ---------------------------------------------------------------------------

/** One summary per assigned project: stage, budget health, the next milestone, open approvals. */
export async function loadManagerWorkspace(user: User): Promise<ManagerProjectSummary[]> {
  const db = bonimosUserDb();
  const ids = await managerProjectIds(db, user.id);
  if (!ids.length) return [];

  const [projectsRes, versionsRes, itemsRes, milestonesRes, requestsRes, activityRes, peopleRows] = await Promise.all([
    db.from('hub_projects').select(PROJECT_COLUMNS).in('id', ids).neq('status', 'archived'),
    db.from('hub_budget_versions').select('*').in('project_id', ids),
    db.from('hub_budget_items').select('*').in('project_id', ids).limit(20000),
    db.from('bonimos_milestones').select('*').in('project_id', ids),
    db.from('bonimos_payment_requests').select('id, project_id, status').in('project_id', ids),
    db.from('bonimos_activity').select('project_id, created_at').in('project_id', ids).order('created_at', { ascending: false }).limit(1000),
    people(db, ids),
  ]);
  for (const [label, res] of [
    ['projects', projectsRes],
    ['versions', versionsRes],
    ['items', itemsRes],
    ['milestones', milestonesRes],
    ['payments', requestsRes],
    ['activity', activityRes],
  ] as const) {
    if (res.error) fail(label, res.error);
  }

  const projects = ((projectsRes.data ?? []) as HubProjectRow[]).filter((p) => p.mode === 'managed');
  const regions = await regionNames(db, projects.map((p) => p.region_id));
  const versions = (versionsRes.data ?? []) as HubBudgetVersionRow[];
  const items = (itemsRes.data ?? []) as HubBudgetItemRow[];
  const milestones = (milestonesRes.data ?? []) as BonimosMilestoneRow[];
  const requests = (requestsRes.data ?? []) as Array<Pick<BonimosPaymentRequestRow, 'id' | 'project_id' | 'status'>>;
  const lastActivity = new Map<string, string>();
  for (const a of (activityRes.data ?? []) as Array<{ project_id: string; created_at: string }>) {
    if (!lastActivity.has(a.project_id)) lastActivity.set(a.project_id, a.created_at);
  }
  const today = israelToday();

  return projects
    .map((p): ManagerProjectSummary => {
      const mine = items.filter((i) => i.project_id === p.id);
      const parts = projectSummaryParts({
        versions: versionPlans(versions.filter((v) => v.project_id === p.id), mine),
        items: budgetItemViews(mine),
        milestones: milestones.filter((m) => m.project_id === p.id).map(milestoneView),
        payments: requests.filter((r) => r.project_id === p.id),
        today,
      });
      return {
        id: p.id,
        title: p.title ?? 'פרויקט בליווי',
        clientName: clientNameOf(peopleRows.filter((x) => x.project_id === p.id).map(personView), p.title ?? 'לקוח'),
        regionName: p.region_id ? regions.get(p.region_id)?.name ?? null : null,
        sizeM2: p.size_m2,
        stage: p.stage,
        ...parts,
        lastActivityAt: lastActivity.get(p.id) ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.approvals.pendingReview - a.approvals.pendingReview ||
        Number(Boolean(b.nextMilestone?.late)) - Number(Boolean(a.nextMilestone?.late)) ||
        (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
    );
}

// ---------------------------------------------------------------------------
// The band on the client's own hub
// ---------------------------------------------------------------------------

export async function loadManagedHubSummary(user: User, projectId: string): Promise<ManagedHubSummary | null> {
  if (!isUuid(projectId)) return null;
  const db = bonimosUserDb();
  const role = await projectRole(db, projectId, user.id);
  if (role !== 'owner') return null;
  const today = israelToday();
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  try {
    const [peopleRows, versionsRes, itemsRes, milestonesRes, requestsRes, photosRes] = await Promise.all([
      people(db, [projectId]),
      db.from('hub_budget_versions').select('*').eq('project_id', projectId),
      db.from('hub_budget_items').select('*').eq('project_id', projectId).limit(2000),
      db.from('bonimos_milestones').select('*').eq('project_id', projectId),
      db.from('bonimos_payment_requests').select('status').eq('project_id', projectId),
      db.from('bonimos_photos').select('taken_on').eq('project_id', projectId).gte('taken_on', weekAgo).limit(1000),
    ]);
    const items = (itemsRes.data ?? []) as HubBudgetItemRow[];
    const plans = versionPlans((versionsRes.data ?? []) as HubBudgetVersionRow[], items);
    const parts = projectSummaryParts({
      versions: plans,
      items: budgetItemViews(items),
      milestones: ((milestonesRes.data ?? []) as BonimosMilestoneRow[]).map(milestoneView),
      payments: (requestsRes.data ?? []) as Array<Pick<BonimosPaymentRequestRow, 'status'>>,
      today,
    });
    return {
      projectId,
      managers: peopleRows.filter((p) => p.role === 'manager').map(personView),
      budget: plans.length ? parts.budget : null,
      nextMilestone: parts.nextMilestone,
      waitingForYou: parts.approvals.pendingClient,
      photosThisWeek: photosInLastWeek(((photosRes.data ?? []) as Array<{ taken_on: string }>).map((p) => ({ takenOn: p.taken_on })), today),
    };
  } catch (err) {
    // The hub must render even if Bonim.Os can't.
    console.error('[bonimos] hub summary failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Does the user manage any project? (Routes a manager without a house of their own to /manage/.) */
export async function isProjectManager(userId: string): Promise<boolean> {
  try {
    return (await managerProjectIds(bonimosUserDb(), userId)).length > 0;
  } catch {
    return false;
  }
}
