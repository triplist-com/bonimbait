import 'server-only';

/**
 * Builder Hub server layer: the member's project, the dashboard data, the
 * import of an anonymous visitor's workspace on signup or login, and the
 * project file for the money link.
 *
 *   getMemberProjectSnapshot(memberId)   -> ProjectFile fields (PROGRAM.md §6)
 *
 * The revenue squad's collectProjectFile() calls it for signed-in members.
 * Everything else runs as the member (RLS: project members only); the
 * snapshot uses the service role because it is keyed by a member id that
 * trusted server code already holds. Never pass it a client-supplied id.
 */
import type { User } from '@supabase/supabase-js';
import type { ConstructionStage } from '@/lib/db/types';
import { getPublicDb } from '@/lib/content/db';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { budgetCategory, plannedFromEstimate } from './budget';
import { isChecklistItemId } from './content';
import { hubAdminDb, hubUserDb, type HubDb } from './db';
import { estimateFromCalculator, initialEstimate } from './estimate';
import { normalizeLocalSaved, type LocalSavedItem } from './local';
import {
  defaultProjectTitle,
  draftToProjectFields,
  isDraftComplete,
  israelToday,
  normalizeDraft,
  profileStageFor,
  projectToDraft,
} from './onboarding';
import { loadStagePicks } from './picks';
import { savedHref, savedThumbnail, validateSaveInput, type SaveInput } from './saved';
import { buildProjectSnapshot, plannerEstimateOf, plannerVersionInputs } from './snapshot';
import type {
  HubBudgetItemRow,
  HubBudgetVersionRow,
  HubDocumentRow,
  HubDraft,
  HubEstimate,
  HubProjectRow,
  HubProView,
  HubSavedItemRow,
  HubTaskRow,
  HubViewData,
  PlannerEstimate,
  ProjectFileSnapshot,
  SavedKind,
} from './types';

export const PROJECT_COLUMNS =
  'id, created_by, title, stage, region_id, size_m2, budget_min_agorot, budget_max_agorot, target_move_in, mode, status, onboarded_at, source, created_at, updated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[hub] ${context}: ${error?.message ?? 'unknown error'}`);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** The member's primary project: their most recently updated active project as its owner. */
export async function getPrimaryProject(db: HubDb, userId: string): Promise<HubProjectRow | null> {
  const { data, error } = await db
    .from('hub_projects')
    .select(PROJECT_COLUMNS)
    .eq('created_by', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('primary project', error);
  return (data as HubProjectRow | null) ?? null;
}

export async function regionIdForSlug(db: HubDb, slug: string | undefined | null): Promise<string | null> {
  if (!slug) return null;
  const { data } = await db.from('regions').select('id').eq('slug', slug).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function regionForId(db: HubDb, id: string | null): Promise<{ slug: string; name: string } | null> {
  if (!id) return null;
  const { data } = await db.from('regions').select('slug, name').eq('id', id).maybeSingle();
  return (data as { slug: string; name: string } | null) ?? null;
}

/** A project shell for a member who saved something before onboarding. */
async function createShellProject(db: HubDb, userId: string, source: string): Promise<HubProjectRow> {
  const { data, error } = await db
    .from('hub_projects')
    .insert({ created_by: userId, source })
    .select(PROJECT_COLUMNS)
    .single();
  if (error || !data) fail('create project', error);
  return data as HubProjectRow;
}

export async function getOrCreateProject(db: HubDb, userId: string, source: string): Promise<HubProjectRow> {
  return (await getPrimaryProject(db, userId)) ?? createShellProject(db, userId, source);
}

export type SaveProjectMode = 'replace' | 'fill';

/**
 * Create or update the member's project from onboarding answers.
 *  - 'replace' (onboarding, editing the project): the answers are the truth;
 *    an unanswered optional field ("עוד לא יודעים") clears it.
 *  - 'fill' (importing a local draft into an existing project): only empty
 *    fields are filled; the server stays the source of truth for members.
 * Marks the project onboarded once stage, region and size are known, and
 * makes sure it has a budget version (v1 = the first estimate).
 */
export async function saveProjectFromDraft(
  db: HubDb,
  userId: string,
  input: HubDraft,
  opts: { mode: SaveProjectMode; source: string; planner?: PlannerEstimate | null; title?: string | null },
): Promise<{ project: HubProjectRow; created: boolean }> {
  const draft = normalizeDraft(input);
  const regionId = await regionIdForSlug(db, draft.regionSlug);
  const fields = draftToProjectFields(draft, regionId);
  const existing = await getPrimaryProject(db, userId);
  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await db
      .from('hub_projects')
      .insert({
        created_by: userId,
        ...fields,
        title: opts.title ?? null,
        source: opts.source,
        onboarded_at: isDraftComplete(draft) ? now : null,
      })
      .select(PROJECT_COLUMNS)
      .single();
    if (error || !data) fail('create project', error);
    const project = data as HubProjectRow;
    await ensureBudgetVersion(db, project, draft, opts.planner ?? null);
    return { project, created: true };
  }

  const patch: Partial<Omit<HubProjectRow, 'id'>> = {};
  const keys = Object.keys(fields) as Array<keyof typeof fields>;
  for (const key of keys) {
    // 'fill' only writes into empty fields; 'replace' writes every answer.
    const next = opts.mode === 'replace' ? fields[key] : existing[key] == null ? fields[key] : existing[key];
    if (next !== existing[key]) (patch as Record<string, unknown>)[key] = next;
  }
  const merged = { ...existing, ...patch } as HubProjectRow;
  const mergedDraft = projectToDraft(merged, draft.regionSlug ?? (await regionForId(db, merged.region_id))?.slug ?? null);
  if (!existing.onboarded_at && isDraftComplete(mergedDraft)) patch.onboarded_at = now;
  if (opts.title && !existing.title) patch.title = opts.title;

  let project = existing;
  if (Object.keys(patch).length) {
    const { data, error } = await db.from('hub_projects').update(patch).eq('id', existing.id).select(PROJECT_COLUMNS).single();
    if (error || !data) fail('update project', error);
    project = data as HubProjectRow;
  }
  const estimateInputsChanged = existing.size_m2 !== project.size_m2 || existing.region_id !== project.region_id;
  await ensureBudgetVersion(db, project, mergedDraft, opts.planner ?? null, { reestimate: estimateInputsChanged });
  return { project, created: false };
}

/** The current budget version of a project, if any. */
export async function currentBudgetVersion(db: HubDb, projectId: string): Promise<HubBudgetVersionRow | null> {
  const { data, error } = await db
    .from('hub_budget_versions')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) fail('budget version', error);
  return (data as HubBudgetVersionRow | null) ?? null;
}

/** Planned lines (agorot) for a version from an estimate range (whole shekels). */
export function plannedLinesFor(totalMin: number, totalMax: number) {
  return Object.entries(plannedFromEstimate(totalMin, totalMax))
    .filter(([, nis]) => nis > 0)
    .map(([category, nis]) => ({ category, amount_agorot: nis * 100 }));
}

export async function createBudgetVersion(
  db: HubDb,
  projectId: string,
  estimate: HubEstimate,
  label: string,
  note: string | null = null,
): Promise<string> {
  const { data, error } = await db.rpc('hub_new_budget_version', {
    p_project: projectId,
    p_label: label,
    p_basis: estimate.basis,
    p_total_min: estimate.totalMin * 100,
    p_total_max: estimate.totalMax * 100,
    p_inputs: estimate.basis === 'planner' && estimate.at
      ? plannerVersionInputs({ totalMin: estimate.totalMin, totalMax: estimate.totalMax, at: estimate.at, inputs: estimate.inputs })
      : estimate.inputs,
    p_note: note,
    p_planned: plannedLinesFor(estimate.totalMin, estimate.totalMax),
  });
  if (error || !data) fail('budget version', error);
  return data as string;
}

/**
 * v1 when the project has no budget yet; a new calculator version when the
 * size or region changed under a calculator-based plan (a planner or
 * manager-made plan is never replaced automatically).
 */
async function ensureBudgetVersion(
  db: HubDb,
  project: HubProjectRow,
  draft: HubDraft,
  planner: PlannerEstimate | null,
  opts: { reestimate?: boolean } = {},
): Promise<void> {
  const current = await currentBudgetVersion(db, project.id);
  if (!current) {
    const estimate = initialEstimate(draft, planner);
    if (!estimate) return;
    await createBudgetVersion(db, project.id, estimate, estimate.basis === 'planner' ? 'הערכה ממתכנן התקציב' : 'הערכה ראשונית');
    return;
  }
  if (opts.reestimate && current.basis === 'calculator') {
    const estimate = estimateFromCalculator(draft);
    if (estimate) await createBudgetVersion(db, project.id, estimate, 'הערכה מעודכנת', 'פרטי הפרויקט השתנו');
  }
}

/** profiles.construction_stage and region_id follow the project (as the member, RLS: own profile). */
export async function syncProfileFromProject(userId: string, project: Pick<HubProjectRow, 'stage' | 'region_id'>): Promise<void> {
  const update: { construction_stage?: ConstructionStage; region_id?: string } = {};
  if (project.stage) update.construction_stage = profileStageFor(project.stage);
  if (project.region_id) update.region_id = project.region_id;
  if (!Object.keys(update).length) return;
  const { error } = await createUserClient().from('profiles').update(update).eq('id', userId);
  if (error) console.error('[hub] profile sync failed:', error.message);
}

// ---------------------------------------------------------------------------
// Saved items
// ---------------------------------------------------------------------------

export async function setSavedItem(db: HubDb, userId: string, item: SaveInput, saved: boolean): Promise<void> {
  if (!saved) {
    const project = await getPrimaryProject(db, userId);
    if (!project) return;
    const { error } = await db.from('hub_saved_items').delete().eq('project_id', project.id).eq('kind', item.kind).eq('ref', item.ref);
    if (error) fail('unsave', error);
    return;
  }
  const project = await getOrCreateProject(db, userId, 'saved');
  const { error } = await db
    .from('hub_saved_items')
    .upsert(
      { project_id: project.id, kind: item.kind, ref: item.ref, title: item.title, meta: item.meta },
      { onConflict: 'project_id,kind,ref', ignoreDuplicates: true },
    );
  if (error) fail('save', error);
}

/** Every saved ref of the member's project (for the ♡ buttons on content pages). */
export async function listSavedRefs(db: HubDb, userId: string): Promise<Array<{ kind: SavedKind; ref: string }>> {
  const project = await getPrimaryProject(db, userId);
  if (!project) return [];
  const { data, error } = await db.from('hub_saved_items').select('kind, ref').eq('project_id', project.id).limit(1000);
  if (error) fail('saved refs', error);
  return (data ?? []) as Array<{ kind: SavedKind; ref: string }>;
}

// ---------------------------------------------------------------------------
// Import of the anonymous workspace (on signup or login)
// ---------------------------------------------------------------------------

export interface LocalImportPayload {
  draft?: unknown;
  saved?: unknown;
  shortlist?: unknown;
  checklist?: unknown;
}

export interface LocalImportResult {
  projectId: string | null;
  onboarded: boolean;
  saved: number;
  checklist: number;
}

/**
 * Bring `bb.hub.draft`, saved items, `bb.shortlist` and ticked checklist
 * items into the member's project. Idempotent (duplicates are ignored), and
 * it never overwrites what the member already has on the server.
 */
export async function importLocalHub(
  db: HubDb,
  userId: string,
  payload: LocalImportPayload,
  opts: { planner?: PlannerEstimate | null } = {},
): Promise<LocalImportResult> {
  const draft = normalizeDraft(payload.draft);
  const saved: LocalSavedItem[] = normalizeLocalSaved({ items: Array.isArray(payload.saved) ? payload.saved : [] });
  const shortlist = Array.isArray(payload.shortlist)
    ? Array.from(new Set(payload.shortlist.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v)))).slice(0, 100)
    : [];
  const checklist = Array.isArray(payload.checklist) ? Array.from(new Set(payload.checklist.filter(isChecklistItemId))) : [];

  const hasDraft = Object.keys(draft).length > 0;
  if (!hasDraft && !saved.length && !shortlist.length && !checklist.length) {
    return { projectId: null, onboarded: false, saved: 0, checklist: 0 };
  }

  let project = await getPrimaryProject(db, userId);
  if (hasDraft) {
    project = (await saveProjectFromDraft(db, userId, draft, { mode: 'fill', source: 'local_import', planner: opts.planner })).project;
  } else if (!project) {
    project = await createShellProject(db, userId, 'local_import');
  }

  // Shortlisted ids without a local saved entry: look up their public names.
  const savedRefs = new Set(saved.filter((s) => s.kind === 'business').map((s) => s.ref));
  const missing = shortlist.filter((id) => !savedRefs.has(id));
  const names = await publicBusinesses(missing);
  const rows: SaveInput[] = [];
  for (const s of saved) {
    const v = validateSaveInput(s);
    if (v.ok) rows.push(v.value);
  }
  for (const id of missing) {
    const b = names.get(id);
    if (b) rows.push({ kind: 'business', ref: id, title: b.name, meta: { slug: b.slug } });
  }
  if (rows.length) {
    const { error } = await db.from('hub_saved_items').upsert(
      rows.map((r) => ({ project_id: project!.id, kind: r.kind, ref: r.ref, title: r.title, meta: r.meta })),
      { onConflict: 'project_id,kind,ref', ignoreDuplicates: true },
    );
    if (error) fail('import saved', error);
  }
  if (checklist.length) {
    const now = new Date().toISOString();
    const { error } = await db.from('hub_checklist_state').upsert(
      checklist.map((item_id) => ({ project_id: project!.id, item_id, done: true, done_at: now })),
      { onConflict: 'project_id,item_id', ignoreDuplicates: true },
    );
    if (error) fail('import checklist', error);
  }
  return { projectId: project.id, onboarded: Boolean(project.onboarded_at), saved: rows.length, checklist: checklist.length };
}

/** Published businesses by id (public data). */
async function publicBusinesses(ids: string[]): Promise<Map<string, { slug: string; name: string }>> {
  const db = getPublicDb();
  if (!db || !ids.length) return new Map();
  const { data } = await db.from('businesses').select('id, slug, name').in('id', ids).eq('status', 'published');
  return new Map((data ?? []).map((b) => [b.id, { slug: b.slug, name: b.name }]));
}

/**
 * The signup form also puts the onboarding draft in the user metadata
 * (`hub_draft`), so a member who confirms the email on another device still
 * lands on their map. Creates the project once, when there is none.
 */
export async function createProjectFromSignupMetadata(user: User): Promise<boolean> {
  const draft = normalizeDraft((user.user_metadata as Record<string, unknown> | undefined)?.hub_draft);
  if (!isDraftComplete(draft)) return false;
  const db = hubUserDb();
  if (await getPrimaryProject(db, user.id)) return false;
  const { project } = await saveProjectFromDraft(db, user.id, draft, { mode: 'fill', source: 'signup' });
  await syncProfileFromProject(user.id, project);
  return true;
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

function toNis(agorot: number | null | undefined): number {
  return Math.round((agorot ?? 0) / 100);
}

/** The shortlist with fresh public details (names, logos, ratings). */
export async function loadShortlist(saved: ReadonlyArray<Pick<HubSavedItemRow, 'kind' | 'ref' | 'title' | 'meta'>>): Promise<HubProView[]> {
  const ids = saved.filter((s) => s.kind === 'business').map((s) => s.ref);
  if (!ids.length) return [];
  const db = getPublicDb();
  const fallback = (s: (typeof saved)[number]): HubProView => ({
    id: s.ref,
    slug: typeof s.meta?.slug === 'string' ? s.meta.slug : '',
    name: s.title ?? 'בעל מקצוע',
    specialty: typeof s.meta?.specialty === 'string' ? s.meta.specialty : null,
    logoUrl: null,
    ratingPercent: null,
    reviewCount: 0,
  });
  if (!db) return saved.filter((s) => s.kind === 'business').map(fallback);
  const [{ data: businesses }, { data: stats }] = await Promise.all([
    db.from('businesses').select('id, slug, name, logo_url, primary_specialty_id').in('id', ids).eq('status', 'published'),
    db.from('business_review_stats').select('business_id, review_count, rating_percent').in('business_id', ids),
  ]);
  const specialtyIds = Array.from(new Set((businesses ?? []).map((b) => b.primary_specialty_id).filter((x): x is string => !!x)));
  const { data: specialties } = specialtyIds.length
    ? await db.from('specialties').select('id, name').in('id', specialtyIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const specialtyName = new Map((specialties ?? []).map((s) => [s.id, s.name]));
  const statsById = new Map((stats ?? []).map((s) => [s.business_id, s]));
  const byId = new Map((businesses ?? []).map((b) => [b.id, b]));
  return saved
    .filter((s) => s.kind === 'business')
    .map((s) => {
      const b = byId.get(s.ref);
      if (!b) return fallback(s);
      const st = statsById.get(b.id);
      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        specialty: (b.primary_specialty_id && specialtyName.get(b.primary_specialty_id)) || null,
        logoUrl: b.logo_url,
        ratingPercent: st ? Number(st.rating_percent) : null,
        reviewCount: st?.review_count ?? 0,
      };
    });
}

export interface MemberHub {
  project: HubProjectRow;
  data: HubViewData;
}

/**
 * Everything the dashboard renders for a signed-in member, or null when the
 * member has no project yet. Runs as the member (RLS).
 */
export async function loadMemberHub(user: User, fullName: string | null): Promise<MemberHub | null> {
  const db = hubUserDb();
  const project = await getPrimaryProject(db, user.id);
  if (!project) return null;

  const [region, checklistRes, version, itemsRes, savedRes, docsRes, tasksRes, contactsRes, picks] = await Promise.all([
    regionForId(db, project.region_id),
    db.from('hub_checklist_state').select('item_id').eq('project_id', project.id).eq('done', true),
    currentBudgetVersion(db, project.id),
    db.from('hub_budget_items').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(2000),
    db.from('hub_saved_items').select('*').eq('project_id', project.id).order('created_at', { ascending: false }).limit(1000),
    db.from('hub_documents').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
    db.from('hub_tasks').select('*').eq('project_id', project.id).order('created_at', { ascending: true }).limit(500),
    db.rpc('hub_my_contacts', { p_limit: 20 }),
    loadStagePicks(),
  ]);
  for (const [label, res] of [
    ['checklist', checklistRes],
    ['budget items', itemsRes],
    ['saved', savedRes],
    ['documents', docsRes],
    ['tasks', tasksRes],
  ] as const) {
    if (res.error) fail(label, res.error);
  }
  if (contactsRes.error) console.error('[hub] contact history unavailable:', contactsRes.error.message);

  const items = (itemsRes.data ?? []) as HubBudgetItemRow[];
  const saved = (savedRes.data ?? []) as HubSavedItemRow[];
  const draft = projectToDraft(project, region?.slug ?? null);

  const planned: Record<string, number> = {};
  if (version) {
    for (const i of items) {
      if (i.kind === 'planned' && i.version_id === version.id) planned[i.category] = (planned[i.category] ?? 0) + toNis(i.amount_agorot);
    }
  }
  const plannerEstimate = plannerEstimateOf(version);
  const estimate: HubEstimate | null = version && version.total_min_agorot != null && version.total_max_agorot != null
    ? {
        totalMin: toNis(version.total_min_agorot),
        totalMax: toNis(version.total_max_agorot),
        basis: version.basis === 'planner' ? 'planner' : 'calculator',
        at: plannerEstimate?.at,
        inputs: version.inputs ?? {},
      }
    : initialEstimate(draft, null);

  const shortlist = await loadShortlist(saved);
  const file: ProjectFileSnapshot = buildProjectSnapshot({ project, regionSlug: region?.slug ?? null, currentVersion: version, saved });

  const data: HubViewData = {
    mode: 'member',
    today: israelToday(),
    project: {
      id: project.id,
      title: project.title ?? defaultProjectTitle(fullName),
      stage: project.stage,
      regionSlug: region?.slug ?? null,
      regionName: region?.name ?? null,
      sizeM2: project.size_m2,
      budgetRangeNis: draft.budgetRangeNis ?? null,
      targetMoveIn: draft.targetMoveIn ?? null,
      onboarded: Boolean(project.onboarded_at),
      mode: project.mode,
    },
    checklistDone: ((checklistRes.data ?? []) as Array<{ item_id: string }>).map((r) => r.item_id),
    estimate,
    budgetVersion: version
      ? {
          id: version.id,
          versionNo: version.version_no,
          label: version.label,
          basis: version.basis,
          totalMin: toNis(version.total_min_agorot),
          totalMax: toNis(version.total_max_agorot),
          createdAt: version.created_at,
          planned,
        }
      : null,
    budgetItems: items
      .filter((i) => i.kind !== 'planned' && budgetCategory(i.category))
      .map((i) => ({
        id: i.id,
        kind: i.kind as 'quote' | 'actual',
        category: i.category,
        label: i.label,
        vendor: i.vendor,
        amount: toNis(i.amount_agorot),
        status: i.status,
        occurredOn: i.occurred_on,
        createdAt: i.created_at,
      })),
    saved: saved
      .filter((s) => s.kind !== 'business')
      .map((s) => ({
        kind: s.kind,
        ref: s.ref,
        title: s.title || s.ref,
        href: savedHref(s.kind, s.ref, s.meta),
        thumbnail: savedThumbnail(s.kind, s.ref, s.meta),
        savedAt: s.created_at,
      })),
    shortlist,
    contacts: (contactsRes.data ?? []).map((c) => ({
      ref: c.lead_ref,
      type: c.lead_type,
      businessName: c.business_name,
      businessSlug: c.business_slug,
      createdAt: c.created_at,
    })),
    documents: ((docsRes.data ?? []) as HubDocumentRow[]).map((d) => ({
      id: d.id,
      fileName: d.file_name,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      category: d.category,
      stage: d.stage,
      note: d.note,
      createdAt: d.created_at,
    })),
    tasks: ((tasksRes.data ?? []) as HubTaskRow[]).map((t) => ({
      id: t.id,
      title: t.title,
      dueOn: t.due_on,
      done: t.done,
      stage: t.stage,
    })),
    picks,
    file,
  };
  return { project, data };
}

// ---------------------------------------------------------------------------
// The money link
// ---------------------------------------------------------------------------

/**
 * The hub's part of a member's project file (PROGRAM.md §6 ProjectFile:
 * stage, regionSlug, sizeM2, budgetRangeNis, targetMoveIn, plannerEstimate,
 * savedCount, shortlistBusinessIds). Null when the member has no project.
 * Service role by default; never throws (a lead must not fail because of the
 * hub), errors are logged and give null.
 */
export async function getMemberProjectSnapshot(
  memberId: string,
  opts: { db?: HubDb } = {},
): Promise<ProjectFileSnapshot | null> {
  if (!UUID_RE.test(memberId)) return null;
  try {
    const db = opts.db ?? hubAdminDb();
    const project = await getPrimaryProject(db, memberId);
    if (!project) return null;
    const [region, version, savedRes] = await Promise.all([
      regionForId(db, project.region_id),
      currentBudgetVersion(db, project.id),
      db.from('hub_saved_items').select('kind, ref').eq('project_id', project.id).limit(1000),
    ]);
    if (savedRes.error) fail('snapshot saved items', savedRes.error);
    return buildProjectSnapshot({
      project,
      regionSlug: region?.slug ?? null,
      currentVersion: version,
      saved: (savedRes.data ?? []) as Array<{ kind: SavedKind; ref: string }>,
    });
  } catch (err) {
    console.error('[hub] getMemberProjectSnapshot failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
