'use server';

/**
 * Bonim.Os server actions for the shared project view (/manage/<id>/). Every
 * action re-validates its input and runs AS THE SIGNED-IN USER: the database
 * decides (RLS, and the SECURITY DEFINER payment RPCs that enforce who may
 * review and who may approve). The role checks here only give a friendlier
 * message first. Results are plain objects with a Hebrew message on failure.
 */
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { User } from '@supabase/supabase-js';
import { trackServer } from '@/lib/analytics/server';
import { getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { isBudgetCategoryId } from '@/lib/hub/budget';
import { israelToday } from '@/lib/hub/onboarding';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MAX_PER_PROJECT,
  DOCUMENT_MIME_TYPES,
  isStageId,
  type DocumentCategory,
  type StageId,
} from '@/lib/hub/types';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadPriceBook } from '@/lib/planner/price-book';
import { checkTransition, TRANSITION_ERROR_MESSAGE } from '@/lib/bonimos/approvals';
import { diffPlans, normalizePlan, planTotal } from '@/lib/bonimos/budget';
import { bonimosUserDb, type BonimosDb } from '@/lib/bonimos/db';
import { scheduleTemplate } from '@/lib/bonimos/milestones';
import { PHOTO_MAX_BYTES, PHOTOS_PER_BATCH } from '@/lib/bonimos/photos';
import { isUuid, projectRole } from '@/lib/bonimos/server';
import { isPaymentAction, type PaymentAction, type PaymentStatus, type ProjectRole } from '@/lib/bonimos/types';

export type BonimosActionError = 'auth' | 'invalid' | 'forbidden' | 'not_found' | 'state' | 'limit' | 'server';
export type BonimosActionFail = { ok: false; error: BonimosActionError; message: string };
export type BonimosActionResult<T extends object = object> = ({ ok: true } & T) | BonimosActionFail;

const MESSAGES: Record<BonimosActionError, string> = {
  auth: 'החיבור פג. התחברו שוב ונמשיך מאותה נקודה.',
  invalid: 'חלק מהפרטים לא תקינים. בדקו ונסו שוב.',
  forbidden: 'הפעולה הזאת שמורה למנהל הפרויקט.',
  not_found: 'הפרויקט לא נמצא, או שאין לכם גישה אליו.',
  state: 'המצב השתנה בינתיים. רעננו את העמוד ונסו שוב.',
  limit: 'הגעתם למגבלה של הפרויקט. פנו לצוות בונים בית.',
  server: 'משהו השתבש בשמירה. נסו שוב בעוד רגע.',
};

function fail(error: BonimosActionError, message = MESSAGES[error]): BonimosActionFail {
  return { ok: false, error, message };
}

/** Postgres errors from RLS, the RPCs and the guards, in Hebrew. */
function fromDbError(err: { code?: string; message?: string } | null | undefined): BonimosActionFail {
  const code = err?.code ?? '';
  const message = err?.message ?? 'unknown';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return /approves|client/i.test(message) ? fail('forbidden', 'אישור התשלום שמור ללקוח.') : fail('forbidden');
  }
  if (code === '55000') return fail('state');
  if (code === '54000' || /Too many rows|limit/i.test(message)) return fail('limit');
  if (code === '22023' || code === '23514' || code === '22P02' || code === '23503') return fail('invalid');
  console.error('[bonimos] action failed:', code, message);
  return fail('server');
}

function fromError(err: unknown): BonimosActionFail {
  const e = err as { code?: string; message?: string };
  return fromDbError({ code: e?.code, message: err instanceof Error ? err.message : String(err) });
}

type Access = { user: User; db: BonimosDb; role: ProjectRole; project: { id: string; stage: StageId | null } };

/** The caller, their role in a MANAGED project, and an RLS-bound client. */
async function access(projectId: unknown): Promise<Access | BonimosActionFail> {
  if (!isEnabled('bonimos')) return fail('not_found');
  if (!isSupabaseConfigured()) return fail('server');
  if (!isUuid(projectId)) return fail('not_found');
  const user = await getUser();
  if (!user) return fail('auth');
  const db = bonimosUserDb();
  const [{ data }, role] = await Promise.all([
    db.from('hub_projects').select('id, mode, stage').eq('id', projectId).maybeSingle(),
    projectRole(db, projectId, user.id).catch(() => null),
  ]);
  const project = data as { id: string; mode: string; stage: StageId | null } | null;
  if (!project || !role || project.mode !== 'managed') return fail('not_found');
  return { user, db, role, project: { id: project.id, stage: project.stage } };
}

async function managerAccess(projectId: unknown): Promise<Access | BonimosActionFail> {
  const a = await access(projectId);
  if ('ok' in a) return a;
  return a.role === 'manager' ? a : fail('forbidden');
}

function refresh() {
  revalidatePath('/manage', 'layout');
  revalidatePath('/my-home', 'layout');
}

const DATE_RE = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Multi-line text (notes): keep line breaks, trim each line. */
function cleanMultiline(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s ? s.slice(0, max) : null;
}

function cleanDate(value: unknown): string | null {
  return typeof value === 'string' && DATE_RE.test(value) ? value : null;
}

function shekels(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[,\s₪]/g, '')) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 1_000_000_000 ? r : null;
}

// ---------------------------------------------------------------------------
// Payment approvals
// ---------------------------------------------------------------------------

export interface PaymentRequestInput {
  contractor: string;
  title: string;
  category: string;
  /** Whole shekels. */
  amount: number;
  milestoneId?: string | null;
  attachmentId?: string | null;
  dueOn?: string | null;
  note?: string | null;
}

/** Record a contractor's payment request (it starts at the manager's review). */
export async function requestPaymentAction(projectId: string, input: PaymentRequestInput): Promise<BonimosActionResult<{ id: string }>> {
  const contractor = cleanText(input?.contractor, 120);
  const title = cleanText(input?.title, 160);
  const amount = shekels(input?.amount);
  if (!contractor || contractor.length < 2) return fail('invalid', 'כתבו את שם הקבלן או בעל המקצוע.');
  if (!title || title.length < 2) return fail('invalid', 'כתבו על מה התשלום (למשל: תשלום 3, תקרת קומת קרקע).');
  if (!isBudgetCategoryId(input?.category)) return fail('invalid', 'בחרו קטגוריה בתקציב.');
  if (!amount) return fail('invalid', 'נא להזין סכום בשקלים.');
  const milestoneId = input?.milestoneId && isUuid(input.milestoneId) ? input.milestoneId : null;
  const attachmentId = input?.attachmentId && isUuid(input.attachmentId) ? input.attachmentId : null;
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { data, error } = await a.db.rpc('bonimos_request_payment', {
    p_project: a.project.id,
    p_contractor: contractor,
    p_title: title,
    p_category: input.category,
    p_amount_agorot: amount * 100,
    p_milestone: milestoneId,
    p_attachment: attachmentId,
    p_due_on: cleanDate(input?.dueOn),
    p_note: cleanText(input?.note, 500),
  });
  if (error || !data) return fromDbError(error);
  await trackServer(
    'bonimos_approval_requested',
    {
      project_id: a.project.id,
      category: input.category,
      actor_role: a.role,
      has_attachment: Boolean(attachmentId),
      has_milestone: Boolean(milestoneId),
    },
    { userId: a.user.id },
  );
  refresh();
  return { ok: true, id: data as string };
}

/** One step of the approval flow (review, approve, return, mark paid, cancel). */
export async function transitionPaymentAction(
  projectId: string,
  requestId: string,
  action: PaymentAction,
  opts: { amount?: number | null; note?: string | null; paidOn?: string | null } = {},
): Promise<BonimosActionResult<{ status: string }>> {
  if (!isUuid(requestId) || !isPaymentAction(action)) return fail('invalid');
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { data: row } = await a.db
    .from('bonimos_payment_requests')
    .select('status, requested_agorot, created_by, created_at, category')
    .eq('id', requestId)
    .eq('project_id', a.project.id)
    .maybeSingle();
  const request = row as { status: string; requested_agorot: number; created_by: string | null; created_at: string; category: string } | null;
  if (!request) return fail('not_found', 'הבקשה לא נמצאה.');

  // Same rules as the database, checked first for a clear message.
  const amount = opts.amount == null ? null : shekels(opts.amount);
  const check = checkTransition({
    status: request.status as PaymentStatus,
    action,
    role: a.role,
    isCreator: request.created_by === a.user.id,
    requested: Math.round(request.requested_agorot / 100),
    amount: opts.amount == null ? null : amount ?? -1,
    note: opts.note,
    paidOn: cleanDate(opts.paidOn),
    today: israelToday(),
  });
  if (!check.ok) return fail(check.error === 'state' ? 'state' : check.error === 'role' ? 'forbidden' : 'invalid', TRANSITION_ERROR_MESSAGE[check.error]);

  const { data, error } = await a.db.rpc('bonimos_payment_transition', {
    p_request: requestId,
    p_action: action,
    p_amount_agorot: check.amount == null ? null : check.amount * 100,
    p_note: check.note,
    p_paid_on: check.paidOn,
  });
  if (error || !data) return fromDbError(error);

  if (action === 'review_approve' || action === 'review_reject') {
    await trackServer(
      'bonimos_approval_reviewed',
      {
        project_id: a.project.id,
        outcome: action === 'review_approve' ? 'approved' : 'rejected',
        adjusted: action === 'review_approve' && check.amount != null && check.amount * 100 < request.requested_agorot,
        category: request.category,
      },
      { userId: a.user.id },
    );
  } else if (action === 'client_approve') {
    await trackServer(
      'bonimos_approval_approved',
      {
        project_id: a.project.id,
        category: request.category,
        hours_waiting: Math.max(0, Math.round((Date.now() - Date.parse(request.created_at)) / 3_600_000)),
      },
      { userId: a.user.id },
    );
  }
  refresh();
  return { ok: true, status: data as string };
}

// ---------------------------------------------------------------------------
// Budget: a new approved version (managers)
// ---------------------------------------------------------------------------

export async function createBudgetVersionAction(
  projectId: string,
  input: { plan: Record<string, number | string>; note: string },
): Promise<BonimosActionResult<{ versionNo: number }>> {
  const plan = normalizePlan(input?.plan);
  const note = cleanText(input?.note, 500);
  if (!plan) return fail('invalid', 'נא להזין סכומים בשקלים לפחות בקטגוריה אחת.');
  if (!note || note.length < 3) return fail('invalid', 'כתבו בכמה מילים למה התקציב משתנה. זה נשמר ביומן.');
  const a = await managerAccess(projectId);
  if ('ok' in a) return a;
  try {
    const { data: current } = await a.db
      .from('hub_budget_versions')
      .select('id, version_no')
      .eq('project_id', a.project.id)
      .eq('is_current', true)
      .maybeSingle();
    const cur = current as { id: string; version_no: number } | null;
    let before: Record<string, number> | null = null;
    if (cur) {
      const { data: lines } = await a.db.from('hub_budget_items').select('category, amount_agorot').eq('version_id', cur.id).eq('kind', 'planned');
      before = {};
      for (const l of (lines ?? []) as Array<{ category: string; amount_agorot: number }>) {
        before[l.category] = (before[l.category] ?? 0) + Math.round(l.amount_agorot / 100);
      }
    }
    const total = planTotal(plan);
    const { error } = await a.db.rpc('hub_new_budget_version', {
      p_project: a.project.id,
      p_label: 'תקציב מאושר',
      p_basis: 'manual',
      p_total_min: total * 100,
      p_total_max: total * 100,
      p_inputs: { source: 'bonimos' },
      p_note: note,
      p_planned: Object.entries(plan)
        .filter(([, nis]) => nis > 0)
        .map(([category, nis]) => ({ category, amount_agorot: nis * 100 })),
    });
    if (error) return fromDbError(error);
    const versionNo = (cur?.version_no ?? 0) + 1;
    await trackServer(
      'bonimos_budget_version_created',
      { project_id: a.project.id, version_no: versionNo, basis: 'manual', categories_changed: diffPlans(before, plan).changes.length },
      { userId: a.user.id },
    );
    refresh();
    return { ok: true, versionNo };
  } catch (err) {
    return fromError(err);
  }
}

// ---------------------------------------------------------------------------
// Milestones (managers)
// ---------------------------------------------------------------------------

export interface MilestoneInput {
  id?: string | null;
  stage: string;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  note?: string | null;
}

export async function saveMilestoneAction(projectId: string, input: MilestoneInput): Promise<BonimosActionResult<{ id: string }>> {
  const title = cleanText(input?.title, 120);
  const plannedStart = cleanDate(input?.plannedStart);
  const plannedEnd = cleanDate(input?.plannedEnd);
  const actualStart = cleanDate(input?.actualStart);
  const actualEnd = cleanDate(input?.actualEnd);
  if (!isStageId(input?.stage)) return fail('invalid', 'בחרו שלב.');
  if (!title || title.length < 2) return fail('invalid', 'תנו לאבן הדרך שם.');
  if (!plannedStart || !plannedEnd || plannedStart > plannedEnd) return fail('invalid', 'תאריך הסיום המתוכנן חייב להיות אחרי תאריך ההתחלה.');
  if (actualEnd && (!actualStart || actualStart > actualEnd)) return fail('invalid', 'כדי לסמן סיום צריך תאריך התחלה בפועל שקודם לו.');
  const a = await managerAccess(projectId);
  if ('ok' in a) return a;
  const row = {
    stage: input.stage,
    title,
    planned_start: plannedStart,
    planned_end: plannedEnd,
    actual_start: actualStart,
    actual_end: actualEnd,
    note: cleanText(input?.note, 300),
  };
  try {
    if (input.id) {
      if (!isUuid(input.id)) return fail('invalid');
      const { data, error } = await a.db.from('bonimos_milestones').update(row).eq('id', input.id).eq('project_id', a.project.id).select('id').maybeSingle();
      if (error) return fromDbError(error);
      if (!data) return fail('not_found', 'אבן הדרך לא נמצאה.');
      refresh();
      return { ok: true, id: (data as { id: string }).id };
    }
    const { data: last } = await a.db
      .from('bonimos_milestones')
      .select('sort_order')
      .eq('project_id', a.project.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await a.db
      .from('bonimos_milestones')
      .insert({ project_id: a.project.id, ...row, sort_order: Math.min(10000, ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10) })
      .select('id')
      .single();
    if (error || !data) return fromDbError(error);
    refresh();
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    return fromError(err);
  }
}

/** "התחלנו" / "הושלם" / back to open, dated today unless given. */
export async function setMilestoneProgressAction(
  projectId: string,
  milestoneId: string,
  step: 'start' | 'complete' | 'reopen',
  date?: string | null,
): Promise<BonimosActionResult> {
  if (!isUuid(milestoneId) || !['start', 'complete', 'reopen'].includes(step)) return fail('invalid');
  const day = cleanDate(date) ?? israelToday();
  if (day > israelToday()) return fail('invalid', 'אי אפשר לסמן התקדמות בתאריך עתידי.');
  const a = await managerAccess(projectId);
  if ('ok' in a) return a;
  const { data: row } = await a.db
    .from('bonimos_milestones')
    .select('actual_start, actual_end')
    .eq('id', milestoneId)
    .eq('project_id', a.project.id)
    .maybeSingle();
  const m = row as { actual_start: string | null; actual_end: string | null } | null;
  if (!m) return fail('not_found', 'אבן הדרך לא נמצאה.');
  const patch =
    step === 'start'
      ? { actual_start: day, actual_end: null }
      : step === 'complete'
        ? { actual_start: m.actual_start && m.actual_start <= day ? m.actual_start : day, actual_end: day }
        : { actual_end: null };
  const { error } = await a.db.from('bonimos_milestones').update(patch).eq('id', milestoneId).eq('project_id', a.project.id);
  if (error) return fromDbError(error);
  refresh();
  return { ok: true };
}

export async function deleteMilestoneAction(projectId: string, milestoneId: string): Promise<BonimosActionResult> {
  if (!isUuid(milestoneId)) return fail('invalid');
  const a = await managerAccess(projectId);
  if ('ok' in a) return a;
  const { error } = await a.db.from('bonimos_milestones').delete().eq('id', milestoneId).eq('project_id', a.project.id);
  if (error) return fromDbError(error);
  refresh();
  return { ok: true };
}

/** A first schedule from the current stage to the keys (growth's price book months). Only on an empty schedule. */
export async function createScheduleAction(projectId: string): Promise<BonimosActionResult<{ added: number }>> {
  const a = await managerAccess(projectId);
  if ('ok' in a) return a;
  const { count } = await a.db.from('bonimos_milestones').select('id', { count: 'exact', head: true }).eq('project_id', a.project.id);
  if ((count ?? 0) > 0) return fail('state', 'כבר יש לוח זמנים. הוסיפו או ערכו אבני דרך.');
  const { book } = await loadPriceBook();
  const drafts = scheduleTemplate(a.project.stage ?? 'planning', israelToday(), book.timelineMonths);
  const { error } = await a.db.from('bonimos_milestones').insert(
    drafts.map((d) => ({
      project_id: a.project.id,
      stage: d.stage,
      title: d.title,
      planned_start: d.plannedStart,
      planned_end: d.plannedEnd,
      sort_order: d.sortOrder,
    })),
  );
  if (error) return fromDbError(error);
  refresh();
  return { ok: true, added: drafts.length };
}

// ---------------------------------------------------------------------------
// Notes (the activity log)
// ---------------------------------------------------------------------------

export async function addNoteAction(projectId: string, body: string): Promise<BonimosActionResult> {
  const text = cleanMultiline(body, 2000);
  if (!text) return fail('invalid', 'כתבו משהו לפני ששולחים.');
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { error } = await a.db.from('bonimos_activity').insert({ project_id: a.project.id, body: text });
  if (error) return fromDbError(error);
  refresh();
  return { ok: true };
}

export async function deleteNoteAction(projectId: string, noteId: string): Promise<BonimosActionResult> {
  if (!isUuid(noteId)) return fail('invalid');
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { data, error } = await a.db
    .from('bonimos_activity')
    .delete()
    .eq('id', noteId)
    .eq('project_id', a.project.id)
    .eq('kind', 'note')
    .select('id');
  if (error) return fromDbError(error);
  if (!(data ?? []).length) return fail('forbidden', 'אפשר למחוק רק הערות שכתבתם.');
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents (the project's hub-docs folder; any member may add or open)
// ---------------------------------------------------------------------------

const EXTENSION: Record<(typeof DOCUMENT_MIME_TYPES)[number], string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const DOC_CATEGORIES: readonly DocumentCategory[] = ['plans', 'permit', 'quote', 'contract', 'receipt', 'photo', 'other'];

function isDocumentMime(value: unknown): value is (typeof DOCUMENT_MIME_TYPES)[number] {
  return typeof value === 'string' && (DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

export async function prepareDocumentAction(
  projectId: string,
  input: { mimeType: string; sizeBytes: number },
): Promise<BonimosActionResult<{ path: string }>> {
  if (!isDocumentMime(input?.mimeType)) return fail('invalid', 'אפשר להעלות PDF או תמונה (JPG, PNG, WEBP, HEIC).');
  if (typeof input.sizeBytes !== 'number' || input.sizeBytes <= 0 || input.sizeBytes > DOCUMENT_MAX_BYTES) {
    return fail('invalid', 'הקובץ גדול מדי. אפשר להעלות עד 10MB.');
  }
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { count } = await a.db.from('hub_documents').select('id', { count: 'exact', head: true }).eq('project_id', a.project.id);
  if ((count ?? 0) >= DOCUMENT_MAX_PER_PROJECT) return fail('limit', 'בתיק יש כבר 100 מסמכים. מחקו מסמכים ישנים ונסו שוב.');
  return { ok: true, path: `${a.project.id}/${randomUUID()}.${EXTENSION[input.mimeType]}` };
}

/** Register an uploaded file; its type and size are read back from storage, not trusted from the browser. */
export async function registerDocumentAction(
  projectId: string,
  input: { path: string; fileName: string; category: string; note?: string | null },
): Promise<BonimosActionResult<{ id: string }>> {
  const a = await access(projectId);
  if ('ok' in a) return a;
  const path = typeof input?.path === 'string' ? input.path : '';
  const match = new RegExp(`^${a.project.id}/([0-9a-f-]{36}\\.(pdf|jpg|png|webp|heic|heif))$`).exec(path);
  if (!match) return fail('invalid');
  const category = DOC_CATEGORIES.includes(input.category as DocumentCategory) ? (input.category as DocumentCategory) : 'other';
  const fileName = cleanText(input.fileName, 160)?.replace(/[\\/]/g, '-') || match[1];
  const storage = createClient().storage.from('hub-docs');
  try {
    const { data: listed, error: listError } = await storage.list(a.project.id, { search: match[1], limit: 1 });
    if (listError) throw listError;
    const object = (listed ?? []).find((o) => o.name === match[1]);
    if (!object) return fail('invalid', 'הקובץ לא הגיע. נסו להעלות שוב.');
    const meta = (object.metadata ?? {}) as { size?: number; mimetype?: string };
    const mime = isDocumentMime(meta.mimetype) ? meta.mimetype : null;
    const size = typeof meta.size === 'number' ? meta.size : null;
    if (!mime || !size || size > DOCUMENT_MAX_BYTES) {
      await storage.remove([path]);
      return fail('invalid', 'אפשר להעלות PDF או תמונה, עד 10MB.');
    }
    const { data, error } = await a.db
      .from('hub_documents')
      .insert({
        project_id: a.project.id,
        storage_path: path,
        file_name: fileName,
        mime_type: mime,
        size_bytes: size,
        category,
        stage: a.project.stage,
        note: cleanText(input.note, 300),
      })
      .select('id')
      .single();
    if (error || !data) {
      await storage.remove([path]);
      return fromDbError(error);
    }
    await trackServer('hub_document_uploaded', { category, mime_type: mime, size_kb: Math.round(size / 1024) }, { userId: a.user.id });
    refresh();
    return { ok: true, id: (data as { id: string }).id };
  } catch (err) {
    return fromError(err);
  }
}

/** A one-minute signed URL to open a document. */
export async function documentUrlAction(projectId: string, documentId: string): Promise<BonimosActionResult<{ url: string }>> {
  if (!isUuid(documentId)) return fail('invalid');
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { data } = await a.db.from('hub_documents').select('storage_path').eq('id', documentId).eq('project_id', a.project.id).maybeSingle();
  const doc = data as { storage_path: string } | null;
  if (!doc) return fail('not_found', 'המסמך לא נמצא.');
  const { data: signed, error } = await createClient().storage.from('hub-docs').createSignedUrl(doc.storage_path, 60);
  if (error || !signed?.signedUrl) return fromError(error ?? new Error('no signed url'));
  return { ok: true, url: signed.signedUrl };
}

export async function deleteDocumentAction(projectId: string, documentId: string): Promise<BonimosActionResult> {
  if (!isUuid(documentId)) return fail('invalid');
  const a = await access(projectId);
  if ('ok' in a) return a;
  try {
    const { data } = await a.db.from('hub_documents').select('storage_path').eq('id', documentId).eq('project_id', a.project.id).maybeSingle();
    const doc = data as { storage_path: string } | null;
    if (!doc) return fail('not_found', 'המסמך לא נמצא.');
    const { error: removeError } = await createClient().storage.from('hub-docs').remove([doc.storage_path]);
    if (removeError) throw removeError;
    const { error } = await a.db.from('hub_documents').delete().eq('id', documentId);
    if (error) return fromDbError(error);
    refresh();
    return { ok: true };
  } catch (err) {
    return fromError(err);
  }
}

// ---------------------------------------------------------------------------
// Site photos (resized in the browser, uploaded straight to bonimos-photos)
// ---------------------------------------------------------------------------

export interface PhotoSlot {
  id: string;
  path: string;
  thumbPath: string;
}

/** Reserve storage paths for a batch of photos. */
export async function preparePhotosAction(projectId: string, count: number): Promise<BonimosActionResult<{ slots: PhotoSlot[] }>> {
  if (!Number.isInteger(count) || count < 1 || count > PHOTOS_PER_BATCH) return fail('invalid', `אפשר להעלות עד ${PHOTOS_PER_BATCH} תמונות בכל פעם.`);
  const a = await access(projectId);
  if ('ok' in a) return a;
  const { count: existing } = await a.db.from('bonimos_photos').select('id', { count: 'exact', head: true }).eq('project_id', a.project.id);
  if ((existing ?? 0) + count > 1000) return fail('limit', 'הגעתם ל-1,000 תמונות בפרויקט. מחקו תמונות ישנות ונסו שוב.');
  const slots = Array.from({ length: count }, () => {
    const id = randomUUID();
    return { id, path: `${a.project.id}/${id}.jpg`, thumbPath: `${a.project.id}/${id}-t.jpg` };
  });
  return { ok: true, slots };
}

/** Register uploaded photos (sizes are read back from storage). */
export async function registerPhotosAction(
  projectId: string,
  input: { stage?: string | null; takenOn?: string | null; photos: Array<{ id: string; width: number; height: number; caption?: string | null }> },
): Promise<BonimosActionResult<{ added: number }>> {
  const photos = Array.isArray(input?.photos) ? input.photos.slice(0, PHOTOS_PER_BATCH) : [];
  if (!photos.length || !photos.every((p) => isUuid(p?.id))) return fail('invalid');
  const takenOn = cleanDate(input?.takenOn) ?? israelToday();
  if (takenOn > israelToday()) return fail('invalid', 'תאריך הצילום לא יכול להיות בעתיד.');
  const a = await access(projectId);
  if ('ok' in a) return a;
  const stage: StageId | null = isStageId(input?.stage) ? input.stage : a.project.stage;
  const storage = createClient().storage.from('bonimos-photos');
  try {
    const rows = [];
    for (const p of photos) {
      const { data: listed, error } = await storage.list(a.project.id, { search: p.id, limit: 4 });
      if (error) throw error;
      const full = (listed ?? []).find((o) => o.name === `${p.id}.jpg`);
      const thumb = (listed ?? []).find((o) => o.name === `${p.id}-t.jpg`);
      const size = (full?.metadata as { size?: number } | undefined)?.size;
      if (!full || !thumb || !size || size > PHOTO_MAX_BYTES) {
        await storage.remove([`${a.project.id}/${p.id}.jpg`, `${a.project.id}/${p.id}-t.jpg`]);
        continue;
      }
      rows.push({
        id: p.id,
        project_id: a.project.id,
        storage_path: `${a.project.id}/${p.id}.jpg`,
        thumb_path: `${a.project.id}/${p.id}-t.jpg`,
        width: Math.min(4096, Math.max(16, Math.round(p.width) || 16)),
        height: Math.min(4096, Math.max(16, Math.round(p.height) || 16)),
        size_bytes: size,
        caption: cleanText(p.caption, 300),
        stage,
        taken_on: takenOn,
      });
    }
    if (!rows.length) return fail('invalid', 'התמונות לא הגיעו. נסו להעלות שוב.');
    const { error } = await a.db.from('bonimos_photos').insert(rows);
    if (error) {
      await storage.remove(rows.flatMap((r) => [r.storage_path, r.thumb_path]));
      return fromDbError(error);
    }
    await trackServer(
      'bonimos_photo_uploaded',
      { project_id: a.project.id, count: rows.length, stage: stage ?? undefined, actor_role: a.role },
      { userId: a.user.id },
    );
    refresh();
    return { ok: true, added: rows.length };
  } catch (err) {
    return fromError(err);
  }
}

export async function deletePhotoAction(projectId: string, photoId: string): Promise<BonimosActionResult> {
  if (!isUuid(photoId)) return fail('invalid');
  const a = await access(projectId);
  if ('ok' in a) return a;
  // The row first (RLS: the uploader or a manager), then the files.
  const { data, error } = await a.db
    .from('bonimos_photos')
    .delete()
    .eq('id', photoId)
    .eq('project_id', a.project.id)
    .select('storage_path, thumb_path');
  if (error) return fromDbError(error);
  const row = (data ?? [])[0] as { storage_path: string; thumb_path: string } | undefined;
  if (!row) return fail('forbidden', 'אפשר למחוק רק תמונות שהעליתם (או מנהל הפרויקט).');
  const { error: removeError } = await createClient().storage.from('bonimos-photos').remove([row.storage_path, row.thumb_path]);
  if (removeError) console.error('[bonimos] photo files not removed:', removeError.message);
  refresh();
  return { ok: true };
}
