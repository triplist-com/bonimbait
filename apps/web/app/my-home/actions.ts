'use server';

/**
 * Builder Hub server actions. Every action re-validates its input, runs as
 * the signed-in member (RLS: project members only) and revalidates
 * /my-home/*. Results are plain objects with a Hebrew message on failure.
 */
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { User } from '@supabase/supabase-js';
import { trackServer } from '@/lib/analytics/server';
import { getUser } from '@/lib/auth/session';
import { bonimosUserDb } from '@/lib/bonimos/db';
import { isEnabled } from '@/lib/flags';
import { budgetCategory, isBudgetCategoryId } from '@/lib/hub/budget';
import { findChecklistItem, isChecklistItemId } from '@/lib/hub/content';
import { hubUserDb, type HubDb } from '@/lib/hub/db';
import { estimateFromPlanner, parsePlannerEstimate } from '@/lib/hub/estimate';
import { isDraftComplete, israelToday, normalizeDraft } from '@/lib/hub/onboarding';
import { weeklyActions } from '@/lib/hub/roadmap';
import { validateSaveInput } from '@/lib/hub/saved';
import {
  createBudgetVersion,
  getPrimaryProject,
  importLocalHub,
  saveProjectFromDraft,
  setSavedItem,
  syncProfileFromProject,
  type LocalImportPayload,
} from '@/lib/hub/server';
import { recordSignupCompleted } from '@/lib/hub/signup';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MAX_PER_PROJECT,
  DOCUMENT_MIME_TYPES,
  isStageId,
  type DocumentCategory,
  type HubProjectRow,
  type StageId,
} from '@/lib/hub/types';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export type HubActionError = 'auth' | 'invalid' | 'no_project' | 'limit' | 'locked' | 'unavailable' | 'server';
export type HubActionFail = { ok: false; error: HubActionError; message: string };
export type HubActionResult<T extends object = object> = ({ ok: true } & T) | HubActionFail;

const MESSAGES: Record<HubActionError, string> = {
  auth: 'כדי לשמור צריך להתחבר. התחברו ונמשיך מאותה נקודה.',
  invalid: 'חלק מהפרטים לא תקינים. בדקו ונסו שוב.',
  no_project: 'עוד אין לכם פרויקט. התחילו במיפוי קצר של 60 שניות.',
  limit: 'הגעתם למגבלה של הפרויקט. מחקו פריטים ישנים ונסו שוב.',
  locked: 'את השורה הזו מעדכן מנהל הפרויקט: היא חלק מהתקציב המאושר או מאישור תשלום.',
  unavailable: 'הבית שלי לא זמין כרגע. נסו שוב מאוחר יותר.',
  server: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.',
};

function fail(error: HubActionError, message = MESSAGES[error]): HubActionFail {
  return { ok: false, error, message };
}

function fromError(err: unknown): HubActionFail {
  const message = err instanceof Error ? err.message : String(err);
  // The Bonim.Os budget lock (20261014130000_qa_bonimos_budget_lock.sql).
  if (/project manager|managed project/i.test(message)) return fail('locked');
  console.error('[hub] action failed:', message);
  return /limit|Too many rows/i.test(message) ? fail('limit') : fail('server');
}

type Member = { user: User; db: HubDb };

async function member(): Promise<Member | HubActionFail> {
  if (!isEnabled('hub')) return fail('unavailable');
  if (!isSupabaseConfigured()) return fail('server');
  const user = await getUser();
  if (!user) return fail('auth');
  return { user, db: hubUserDb() };
}

async function memberProject(): Promise<(Member & { project: HubProjectRow }) | HubActionFail> {
  const m = await member();
  if ('ok' in m) return m;
  const project = await getPrimaryProject(m.db, m.user.id);
  if (!project) return fail('no_project');
  return { ...m, project };
}

function refresh() {
  revalidatePath('/my-home', 'layout');
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

function addDays(date: string, days: number): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Onboarding and the local workspace
// ---------------------------------------------------------------------------

/** Save the onboarding answers as the member's project (and sync the profile). */
export async function saveOnboardingAction(input: { draft: unknown; planner?: unknown }): Promise<HubActionResult<{ projectId: string }>> {
  const m = await member();
  if ('ok' in m) return m;
  const draft = normalizeDraft(input?.draft);
  if (!isDraftComplete(draft)) return fail('invalid');
  try {
    const { project } = await saveProjectFromDraft(m.db, m.user.id, draft, {
      mode: 'replace',
      source: 'onboarding',
      planner: parsePlannerEstimate(input?.planner),
    });
    await syncProfileFromProject(m.user.id, project);
    refresh();
    return { ok: true, projectId: project.id };
  } catch (err) {
    return fromError(err);
  }
}

/** Import the anonymous workspace (draft, saved, shortlist, checklist) after signup or login. */
export async function importLocalHubAction(
  payload: LocalImportPayload & { planner?: unknown },
): Promise<HubActionResult<{ projectId: string | null; onboarded: boolean }>> {
  const m = await member();
  if ('ok' in m) return m;
  try {
    const result = await importLocalHub(m.db, m.user.id, payload ?? {}, { planner: parsePlannerEstimate(payload?.planner) });
    if (result.projectId) {
      const project = await getPrimaryProject(m.db, m.user.id);
      if (project?.onboarded_at) await syncProfileFromProject(m.user.id, project);
      refresh();
    }
    return { ok: true, projectId: result.projectId, onboarded: result.onboarded };
  } catch (err) {
    return fromError(err);
  }
}

/** signup_completed for a new account (the email form's instant-session path). */
export async function completeSignupAction(): Promise<{ ok: boolean }> {
  const user = await getUser();
  if (!user) return { ok: false };
  return { ok: await recordSignupCompleted(user) };
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

export async function toggleChecklistAction(itemId: string, done: boolean): Promise<HubActionResult> {
  if (!isChecklistItemId(itemId)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { error } = await m.db.from('hub_checklist_state').upsert(
      { project_id: m.project.id, item_id: itemId, done: Boolean(done), done_at: done ? new Date().toISOString() : null },
      { onConflict: 'project_id,item_id' },
    );
    if (error) throw new Error(error.message);
    if (done) {
      const item = findChecklistItem(itemId);
      if (item) await trackServer('hub_checklist_item_done', { stage: item.stage, item_id: itemId }, { userId: m.user.id });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

/** Move the project to another stage ("עברנו לשלב הבא"). */
export async function setStageAction(stage: string): Promise<HubActionResult> {
  if (!isStageId(stage)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { data, error } = await m.db
      .from('hub_projects')
      .update({ stage })
      .eq('id', m.project.id)
      .select('stage, region_id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'update failed');
    await syncProfileFromProject(m.user.id, data as Pick<HubProjectRow, 'stage' | 'region_id'>);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export interface BudgetItemInput {
  kind: 'quote' | 'actual';
  category: string;
  /** Whole shekels. */
  amount: number;
  label?: string | null;
  vendor?: string | null;
  occurredOn?: string | null;
}

export async function addBudgetItemAction(input: BudgetItemInput): Promise<HubActionResult> {
  const kind = input?.kind;
  const amount = typeof input?.amount === 'number' ? Math.round(input.amount) : NaN;
  if ((kind !== 'quote' && kind !== 'actual') || !isBudgetCategoryId(input?.category)) return fail('invalid');
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000_000) return fail('invalid', 'נא להזין סכום בשקלים.');
  const occurredOn = input?.occurredOn && DATE_RE.test(input.occurredOn) ? input.occurredOn : null;
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { error } = await m.db.from('hub_budget_items').insert({
      project_id: m.project.id,
      kind,
      category: input.category,
      amount_agorot: amount * 100,
      label: cleanText(input.label, 120),
      vendor: cleanText(input.vendor, 120),
      status: kind === 'quote' ? 'open' : 'paid',
      occurred_on: occurredOn,
    });
    if (error) throw new Error(error.message);
    await trackServer(
      'hub_budget_item_added',
      { kind, category: input.category, stage: budgetCategory(input.category)?.stage ?? undefined },
      { userId: m.user.id },
    );
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

export async function setQuoteStatusAction(id: string, status: 'open' | 'accepted' | 'rejected'): Promise<HubActionResult> {
  if (!UUID_RE.test(id) || !['open', 'accepted', 'rejected'].includes(status)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { error } = await m.db
      .from('hub_budget_items')
      .update({ status })
      .eq('id', id)
      .eq('project_id', m.project.id)
      .eq('kind', 'quote');
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

export async function deleteBudgetItemAction(id: string): Promise<HubActionResult> {
  if (!UUID_RE.test(id)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    // A payment the manager's approval recorded stays in the managed budget
    // (the database refuses it too; this only gives the friendlier message).
    if (m.project.mode === 'managed' && (await isApprovalRecorded(id))) return fail('locked');
    const { error } = await m.db
      .from('hub_budget_items')
      .delete()
      .eq('id', id)
      .eq('project_id', m.project.id)
      .neq('kind', 'planned');
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

/** Whether a budget line was recorded by a Bonim.Os payment approval (RLS: project members). */
async function isApprovalRecorded(itemId: string): Promise<boolean> {
  const { data, error } = await bonimosUserDb()
    .from('bonimos_payment_requests')
    .select('id')
    .eq('budget_item_id', itemId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** A new budget version from growth's planner result (bb.planner.last). */
export async function rebaseBudgetFromPlannerAction(planner: unknown): Promise<HubActionResult> {
  const parsed = parsePlannerEstimate(planner);
  if (!parsed) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    await createBudgetVersion(m.db, m.project.id, estimateFromPlanner(parsed), 'הערכה ממתכנן התקציב', 'עודכן מתוצאת מתכנן התקציב');
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function addTaskAction(input: { title: string; dueOn?: string | null; stage?: string | null }): Promise<HubActionResult> {
  const title = cleanText(input?.title, 160);
  if (!title) return fail('invalid', 'כתבו מה צריך לעשות.');
  const dueOn = input?.dueOn && DATE_RE.test(input.dueOn) ? input.dueOn : null;
  const stage = isStageId(input?.stage) ? input.stage : null;
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { error } = await m.db.from('hub_tasks').insert({ project_id: m.project.id, title, due_on: dueOn, stage: stage ?? m.project.stage });
    if (error) throw new Error(error.message);
    await trackServer('hub_task_added', { stage: stage ?? m.project.stage ?? undefined, has_due_date: Boolean(dueOn), source: 'manual' }, { userId: m.user.id });
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

/** The next three checklist items of the stage as tasks, a week apart. */
export async function addSuggestedTasksAction(): Promise<HubActionResult<{ added: number }>> {
  const m = await memberProject();
  if ('ok' in m) return m;
  if (!m.project.stage) return fail('no_project');
  try {
    const [{ data: done }, { data: existing }] = await Promise.all([
      m.db.from('hub_checklist_state').select('item_id').eq('project_id', m.project.id).eq('done', true),
      m.db.from('hub_tasks').select('title').eq('project_id', m.project.id),
    ]);
    const titles = new Set((existing ?? []).map((t) => (t as { title: string }).title));
    const today = israelToday();
    const actions = weeklyActions(m.project.stage, new Set((done ?? []).map((d) => (d as { item_id: string }).item_id)), 3).filter(
      (a) => !titles.has(a.title),
    );
    if (actions.length) {
      const { error } = await m.db.from('hub_tasks').insert(
        actions.map((a, i) => ({ project_id: m.project.id, title: a.title, due_on: addDays(today, 7 * (i + 1)), stage: a.stage })),
      );
      if (error) throw new Error(error.message);
      await trackServer('hub_task_added', { stage: m.project.stage, has_due_date: true, source: 'suggested' }, { userId: m.user.id });
    }
    refresh();
    return { ok: true, added: actions.length };
  } catch (err) {
    return fromError(err);
  }
}

export async function toggleTaskAction(id: string, done: boolean): Promise<HubActionResult> {
  if (!UUID_RE.test(id)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { error } = await m.db
      .from('hub_tasks')
      .update({ done: Boolean(done), done_at: done ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('project_id', m.project.id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

export async function deleteTaskAction(id: string): Promise<HubActionResult> {
  if (!UUID_RE.test(id)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { error } = await m.db.from('hub_tasks').delete().eq('id', id).eq('project_id', m.project.id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

// ---------------------------------------------------------------------------
// Saved items (♡) and the shortlist
// ---------------------------------------------------------------------------

export async function toggleSavedAction(input: {
  kind: string;
  ref: string;
  title?: string;
  meta?: Record<string, string>;
  saved: boolean;
}): Promise<HubActionResult<{ saved: boolean }>> {
  const v = validateSaveInput(input);
  if (!v.ok) return fail('invalid');
  const m = await member();
  if ('ok' in m) return m;
  try {
    await setSavedItem(m.db, m.user.id, v.value, Boolean(input.saved));
    refresh();
    return { ok: true, saved: Boolean(input.saved) };
  } catch (err) {
    return fromError(err);
  }
}

// ---------------------------------------------------------------------------
// Documents (files go straight from the browser to the private hub-docs
// bucket, under RLS; these actions reserve the path and register the row)
// ---------------------------------------------------------------------------

const EXTENSION: Record<(typeof DOCUMENT_MIME_TYPES)[number], string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const CATEGORIES: readonly DocumentCategory[] = ['plans', 'permit', 'quote', 'contract', 'receipt', 'photo', 'other'];

function isDocumentMime(value: unknown): value is (typeof DOCUMENT_MIME_TYPES)[number] {
  return typeof value === 'string' && (DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

/** Reserve a storage path for an upload: '<project_id>/<uuid>.<ext>'. */
export async function prepareDocumentUploadAction(input: {
  mimeType: string;
  sizeBytes: number;
}): Promise<HubActionResult<{ path: string }>> {
  if (!isDocumentMime(input?.mimeType)) return fail('invalid', 'אפשר להעלות PDF או תמונה (JPG, PNG, WEBP, HEIC).');
  if (typeof input.sizeBytes !== 'number' || input.sizeBytes <= 0 || input.sizeBytes > DOCUMENT_MAX_BYTES) {
    return fail('invalid', 'הקובץ גדול מדי. אפשר להעלות עד 10MB.');
  }
  const m = await memberProject();
  if ('ok' in m) return m;
  const { count } = await m.db.from('hub_documents').select('id', { count: 'exact', head: true }).eq('project_id', m.project.id);
  if ((count ?? 0) >= DOCUMENT_MAX_PER_PROJECT) return fail('limit');
  return { ok: true, path: `${m.project.id}/${randomUUID()}.${EXTENSION[input.mimeType]}` };
}

/** Register an uploaded file (its size and type are read back from storage, not trusted from the browser). */
export async function registerDocumentAction(input: {
  path: string;
  fileName: string;
  category: string;
  stage?: string | null;
  note?: string | null;
}): Promise<HubActionResult> {
  const m = await memberProject();
  if ('ok' in m) return m;
  const path = typeof input?.path === 'string' ? input.path : '';
  const match = new RegExp(`^${m.project.id}/([0-9a-f-]{36}\\.(pdf|jpg|png|webp|heic|heif))$`).exec(path);
  if (!match) return fail('invalid');
  const category = CATEGORIES.includes(input.category as DocumentCategory) ? (input.category as DocumentCategory) : 'other';
  const fileName = cleanText(input.fileName, 160)?.replace(/[\\/]/g, '-') || match[1];
  try {
    const storage = createClient().storage.from('hub-docs');
    const { data: listed, error: listError } = await storage.list(m.project.id, { search: match[1], limit: 1 });
    if (listError) throw new Error(listError.message);
    const object = (listed ?? []).find((o) => o.name === match[1]);
    if (!object) return fail('invalid', 'הקובץ לא הגיע. נסו להעלות שוב.');
    const meta = (object.metadata ?? {}) as { size?: number; mimetype?: string };
    const mime = isDocumentMime(meta.mimetype) ? meta.mimetype : null;
    const size = typeof meta.size === 'number' ? meta.size : null;
    if (!mime || !size || size > DOCUMENT_MAX_BYTES) {
      await storage.remove([path]);
      return fail('invalid', 'אפשר להעלות PDF או תמונה, עד 10MB.');
    }
    const stage: StageId | null = isStageId(input.stage) ? input.stage : m.project.stage;
    const { error } = await m.db.from('hub_documents').insert({
      project_id: m.project.id,
      storage_path: path,
      file_name: fileName,
      mime_type: mime,
      size_bytes: size,
      category,
      stage,
      note: cleanText(input.note, 300),
    });
    if (error) {
      await storage.remove([path]);
      throw new Error(error.message);
    }
    await trackServer('hub_document_uploaded', { category, mime_type: mime, size_kb: Math.round(size / 1024) }, { userId: m.user.id });
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

/** A one-minute signed URL to open or download a document. */
export async function documentUrlAction(id: string): Promise<HubActionResult<{ url: string }>> {
  if (!UUID_RE.test(id)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  const { data } = await m.db
    .from('hub_documents')
    .select('storage_path, file_name')
    .eq('id', id)
    .eq('project_id', m.project.id)
    .maybeSingle();
  const doc = data as { storage_path: string; file_name: string } | null;
  if (!doc) return fail('invalid');
  const { data: signed, error } = await createClient().storage.from('hub-docs').createSignedUrl(doc.storage_path, 60);
  if (error || !signed?.signedUrl) return fromError(error ?? new Error('no signed url'));
  return { ok: true, url: signed.signedUrl };
}

export async function deleteDocumentAction(id: string): Promise<HubActionResult> {
  if (!UUID_RE.test(id)) return fail('invalid');
  const m = await memberProject();
  if ('ok' in m) return m;
  try {
    const { data } = await m.db.from('hub_documents').select('storage_path').eq('id', id).eq('project_id', m.project.id).maybeSingle();
    const doc = data as { storage_path: string } | null;
    if (!doc) return fail('invalid');
    const { error: removeError } = await createClient().storage.from('hub-docs').remove([doc.storage_path]);
    if (removeError) throw new Error(removeError.message);
    const { error } = await m.db.from('hub_documents').delete().eq('id', id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}
