/**
 * The activity log in Hebrew: one line per event (written by the database
 * triggers in 20261014126000_bonimos_core.sql), with bursts folded into one
 * line ("נוספו 15 אבני דרך"). The sentences avoid gendered verbs: the actor is
 * shown next to the line, not inside it. Pure and client-safe.
 */
import { budgetCategory } from '@/lib/hub/budget';
import { dayMonthLabel, formatMoney } from '@/lib/hub/format';
import { isStageId } from '@/lib/hub/types';
import { getStage } from '@/lib/stages';
import type { ActivityKind, ActivityView, PersonView, ProjectRole } from './types';

export interface ActivityLine {
  id: string;
  kind: ActivityKind;
  action: string;
  /** The sentence. */
  text: string;
  /** A second line: the note, the reason, the caption. */
  detail: string | null;
  actorId: string | null;
  actorName: string;
  actorRole: ProjectRole | null;
  createdAt: string;
  /** How many events this line folds together. */
  count: number;
  refId: string | null;
  /** Photo ids for a photo line (thumbnails). */
  photoIds: string[];
  /** A note the viewer may delete. */
  deletable: boolean;
}

function str(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null;
}

function num(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function stageLabel(value: string | null): string | null {
  return value && isStageId(value) ? getStage(value)?.label ?? null : null;
}

function agorotMoney(meta: Record<string, unknown>, key: string): string | null {
  const a = num(meta, key);
  return a == null ? null : formatMoney(Math.round(a / 100));
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`;
}

/** The sentence and detail for one event (count > 1: a folded burst). */
export function describeActivity(a: Pick<ActivityView, 'action' | 'body' | 'meta'>, count = 1): { text: string; detail: string | null } {
  const m = a.meta ?? {};
  const no = num(m, 'number');
  const req = no != null ? `#${no}` : '';
  const title = str(m, 'title');
  const money = agorotMoney(m, 'amount_agorot');
  const note = str(m, 'note');
  switch (a.action) {
    case 'note.added':
      return { text: a.body ?? '', detail: null };
    case 'payment.requested':
      return {
        text: `נרשמה בקשת תשלום ${req}${str(m, 'contractor') ? ` מ${str(m, 'contractor')}` : ''}${money ? `: ${money}` : ''}`,
        detail: title,
      };
    case 'payment.review_approve':
      return { text: `בקשה ${req} נבדקה ועברה לאישור הלקוח${money ? ` (${money})` : ''}`, detail: note ?? title };
    case 'payment.review_reject':
      return { text: `בקשה ${req} נדחתה בבדיקה`, detail: note ?? title };
    case 'payment.client_approve':
      return { text: `בקשה ${req} אושרה לתשלום${money ? ` (${money})` : ''}`, detail: title };
    case 'payment.client_return':
      return { text: `בקשה ${req} הוחזרה למנהל עם שאלה`, detail: note ?? title };
    case 'payment.mark_paid':
      return { text: `בקשה ${req} שולמה ונרשמה בתקציב${money ? ` (${money})` : ''}`, detail: title };
    case 'payment.cancel':
      return { text: `בקשה ${req} בוטלה`, detail: note ?? title };
    case 'budget.version_created': {
      const v = num(m, 'version_no');
      return { text: `${str(m, 'label') ?? 'תקציב'}${v != null ? ` · גרסה ${v}` : ''}`, detail: note };
    }
    case 'milestone.added':
      return count > 1
        ? { text: `נוספו ${count} אבני דרך ללוח הזמנים`, detail: null }
        : { text: `אבן דרך חדשה: ${title ?? ''}`, detail: str(m, 'planned_end') ? `מתוכנן עד ${dayMonthLabel(str(m, 'planned_end')!)}` : null };
    case 'milestone.started':
      return { text: `התחילו: ${title ?? ''}`, detail: stageLabel(str(m, 'stage')) };
    case 'milestone.completed': {
      const slip = num(m, 'slip_days') ?? 0;
      return {
        text: `הושלמה אבן דרך: ${title ?? ''}`,
        detail: slip > 0 ? `באיחור של ${plural(slip, 'יום', 'ימים')}` : slip < 0 ? `לפני הזמן ב-${plural(-slip, 'יום', 'ימים')}` : 'בדיוק בזמן',
      };
    }
    case 'milestone.rescheduled': {
      const from = str(m, 'from_end');
      const to = str(m, 'to_end');
      const later = from && to ? to > from : true;
      return { text: `${title ?? 'אבן דרך'} ${later ? 'נדחתה' : 'הוקדמה'}${to ? ` ל-${dayMonthLabel(to)}` : ''}`, detail: null };
    }
    case 'milestone.removed':
      return { text: count > 1 ? `הוסרו ${count} אבני דרך` : `הוסרה אבן דרך: ${title ?? ''}`, detail: null };
    case 'photo.uploaded': {
      const n = Math.max(1, num(m, 'count') ?? 1);
      const stage = stageLabel(str(m, 'stage'));
      return { text: `${n === 1 ? 'תמונה חדשה' : `${n} תמונות חדשות`} מהשטח${stage ? ` · ${stage}` : ''}`, detail: str(m, 'caption') };
    }
    case 'document.uploaded':
      return count > 1 ? { text: `${count} מסמכים חדשים בתיק`, detail: null } : { text: `מסמך חדש בתיק: ${str(m, 'file_name') ?? ''}`, detail: null };
    case 'document.deleted':
      return { text: `נמחק מסמך: ${str(m, 'file_name') ?? ''}`, detail: null };
    case 'team.manager_assigned':
      return { text: `${str(m, 'name') ?? 'מנהל פרויקט'} מלווה את הפרויקט`, detail: null };
    case 'team.manager_removed':
      return { text: `הליווי של ${str(m, 'name') ?? 'מנהל הפרויקט'} הסתיים`, detail: null };
    case 'team.managed_started':
      return { text: 'הפרויקט עבר לליווי מלא ב-Bonim.Os', detail: null };
    case 'team.managed_ended':
      return { text: 'הליווי ב-Bonim.Os הסתיים', detail: null };
    case 'stage.changed': {
      const to = stageLabel(str(m, 'to'));
      return { text: to ? `הפרויקט עבר לשלב ${to}` : 'שלב הפרויקט עודכן', detail: null };
    }
    default: {
      const category = budgetCategory(str(m, 'category') ?? '');
      return { text: 'עדכון בפרויקט', detail: category?.label ?? null };
    }
  }
}

/** Events that fold into one line when they come in a burst from one person. */
const FOLDABLE = new Set(['milestone.added', 'milestone.removed', 'document.uploaded']);
const FOLD_WINDOW_MS = 30 * 60 * 1000;

/**
 * Lines for the activity feed, newest first. `people` names the actors;
 * events from the service (an admin assignment) show as "צוות בונים בית".
 */
export function activityLines(
  activity: readonly ActivityView[],
  people: readonly PersonView[],
  viewerId: string | null,
): ActivityLine[] {
  const byId = new Map(people.map((p) => [p.userId, p]));
  const sorted = [...activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lines: ActivityLine[] = [];
  for (const a of sorted) {
    const prev = lines.at(-1);
    if (
      prev &&
      FOLDABLE.has(a.action) &&
      prev.action === a.action &&
      prev.actorId === a.actorId &&
      Date.parse(prev.createdAt) - Date.parse(a.createdAt) <= FOLD_WINDOW_MS
    ) {
      prev.count += 1;
      const d = describeActivity(a, prev.count);
      prev.text = d.text;
      prev.detail = d.detail;
      continue;
    }
    const person = a.actorId ? byId.get(a.actorId) : undefined;
    const d = describeActivity(a);
    const photoIds = Array.isArray(a.meta?.photo_ids) ? (a.meta.photo_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    lines.push({
      id: a.id,
      kind: a.kind,
      action: a.action,
      text: d.text,
      detail: d.detail,
      actorId: a.actorId,
      actorName: person?.name ?? (a.actorId ? 'משתמש לשעבר' : 'צוות בונים בית'),
      actorRole: person?.role ?? null,
      createdAt: a.createdAt,
      count: 1,
      refId: a.refId,
      photoIds,
      deletable: a.kind === 'note' && Boolean(viewerId) && a.actorId === viewerId,
    });
  }
  return lines;
}

export const ROLE_LABEL: Readonly<Record<ProjectRole, string>> = {
  owner: 'הלקוח',
  manager: 'מנהל הפרויקט',
};
