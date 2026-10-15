/**
 * Contractor payment approvals: the state machine, mirrored exactly by the
 * SQL in supabase/migrations/20261014126000_bonimos_core.sql
 * (bonimos_payment_transition). The database is the authority; this module
 * decides which buttons each role sees, validates input before a round trip,
 * and runs the demo in memory. Pure and client-safe.
 *
 *   pending_review --review_approve (manager)--> pending_client --client_approve (client)--> approved --mark_paid--> paid
 *        |   ^                                       |
 *        |   +------------client_return (client)-----+
 *        +--review_reject (manager)--> rejected
 *   pending_review | pending_client --cancel (manager or whoever recorded it)--> cancelled
 *
 * A workflow and an audit log only: no money moves.
 */
import type { BadgeTone } from '@/components/ui/Badge';
import type { PaymentAction, PaymentEventView, PaymentRequestView, PaymentStatus, ProjectRole } from './types';

export interface TransitionRule {
  from: readonly PaymentStatus[];
  to: PaymentStatus;
  roles: readonly ProjectRole[];
  /** Whoever recorded the request may also take this action. */
  creatorMay?: boolean;
  noteRequired?: boolean;
  /** The manager may approve less than was requested. */
  adjustsAmount?: boolean;
}

export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentAction, TransitionRule>> = {
  review_approve: { from: ['pending_review'], to: 'pending_client', roles: ['manager'], adjustsAmount: true },
  review_reject: { from: ['pending_review'], to: 'rejected', roles: ['manager'], noteRequired: true },
  client_approve: { from: ['pending_client'], to: 'approved', roles: ['owner'] },
  client_return: { from: ['pending_client'], to: 'pending_review', roles: ['owner'], noteRequired: true },
  mark_paid: { from: ['approved'], to: 'paid', roles: ['owner', 'manager'] },
  cancel: { from: ['pending_review', 'pending_client'], to: 'cancelled', roles: ['manager'], creatorMay: true },
};

/** Display order of the actions (the primary one first). */
const ACTION_ORDER: readonly PaymentAction[] = [
  'review_approve',
  'client_approve',
  'mark_paid',
  'client_return',
  'review_reject',
  'cancel',
];

export type TransitionError = 'role' | 'state' | 'note_required' | 'amount' | 'date';

export interface TransitionInput {
  status: PaymentStatus;
  action: PaymentAction;
  role: ProjectRole;
  isCreator?: boolean;
  /** Whole shekels. */
  requested: number;
  /** review_approve: the approved amount (default: the requested amount). */
  amount?: number | null;
  note?: string | null;
  /** mark_paid: YYYY-MM-DD (default: today). */
  paidOn?: string | null;
  /** YYYY-MM-DD in Israel. */
  today: string;
}

export type TransitionCheck =
  | { ok: true; to: PaymentStatus; amount: number | null; paidOn: string | null; note: string | null }
  | { ok: false; error: TransitionError };

function cleanNote(note: string | null | undefined): string | null {
  const s = (note ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 500) : null;
}

export function mayTake(rule: TransitionRule, role: ProjectRole, isCreator = false): boolean {
  return rule.roles.includes(role) || (Boolean(rule.creatorMay) && isCreator);
}

/** Validate one step, as the database will. */
export function checkTransition(input: TransitionInput): TransitionCheck {
  const rule = PAYMENT_TRANSITIONS[input.action];
  if (!mayTake(rule, input.role, input.isCreator)) return { ok: false, error: 'role' };
  if (!rule.from.includes(input.status)) return { ok: false, error: 'state' };
  const note = cleanNote(input.note);
  if (rule.noteRequired && !note) return { ok: false, error: 'note_required' };

  let amount: number | null = null;
  if (input.action === 'review_approve') {
    amount = input.amount == null ? input.requested : Math.round(input.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > input.requested) return { ok: false, error: 'amount' };
  }

  let paidOn: string | null = null;
  if (input.action === 'mark_paid') {
    paidOn = input.paidOn || input.today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > input.today) return { ok: false, error: 'date' };
  }
  return { ok: true, to: rule.to, amount, paidOn, note };
}

/** The actions `role` can take on a request now, primary first. */
export function availableActions(status: PaymentStatus, role: ProjectRole, isCreator = false): PaymentAction[] {
  return ACTION_ORDER.filter((a) => {
    const rule = PAYMENT_TRANSITIONS[a];
    return rule.from.includes(status) && mayTake(rule, role, isCreator);
  });
}

export type WaitingOn = 'manager' | 'client' | 'payment' | null;

/** Who has to act next. */
export function waitingOn(status: PaymentStatus): WaitingOn {
  if (status === 'pending_review') return 'manager';
  if (status === 'pending_client') return 'client';
  if (status === 'approved') return 'payment';
  return null;
}

export function isOpenStatus(status: PaymentStatus): boolean {
  return waitingOn(status) !== null;
}

/** Is it this viewer's turn? */
export function isMyTurn(status: PaymentStatus, role: ProjectRole): boolean {
  const w = waitingOn(status);
  return (w === 'manager' && role === 'manager') || (w === 'client' && role === 'owner');
}

export interface ApprovalCounts {
  pendingReview: number;
  pendingClient: number;
  approvedUnpaid: number;
}

export function approvalCounts(requests: ReadonlyArray<Pick<PaymentRequestView, 'status'>>): ApprovalCounts {
  return {
    pendingReview: requests.filter((r) => r.status === 'pending_review').length,
    pendingClient: requests.filter((r) => r.status === 'pending_client').length,
    approvedUnpaid: requests.filter((r) => r.status === 'approved').length,
  };
}

/** The amount that counts for a request: the approved one once reviewed. */
export function effectiveAmount(r: Pick<PaymentRequestView, 'requested' | 'approved'>): number {
  return r.approved ?? r.requested;
}

/** Open requests first (the viewer's turn on top), then the rest, newest first. */
export function sortRequests<T extends Pick<PaymentRequestView, 'status' | 'createdAt' | 'number'>>(requests: readonly T[], role: ProjectRole): T[] {
  const rank = (r: T) => (isMyTurn(r.status, role) ? 0 : isOpenStatus(r.status) ? 1 : 2);
  return [...requests].sort((a, b) => rank(a) - rank(b) || b.number - a.number);
}

/**
 * Apply a step in memory (the demo, and optimistic UI): the updated request
 * with its new audit event. Throws on an invalid step; check it first.
 */
export function applyTransition(
  request: PaymentRequestView,
  step: Omit<TransitionInput, 'status' | 'requested'> & { actorId: string; at: string; eventId: string },
): PaymentRequestView {
  const check = checkTransition({ ...step, status: request.status, requested: request.requested });
  if (!check.ok) throw new Error(`invalid payment transition: ${check.error}`);
  const approved =
    step.action === 'review_approve' ? check.amount : step.action === 'client_return' ? null : request.approved;
  const event: PaymentEventView = {
    id: step.eventId,
    action: step.action,
    fromStatus: request.status,
    toStatus: check.to,
    actorId: step.actorId,
    actorRole: step.role,
    amount: step.action === 'review_approve' ? check.amount : step.action === 'client_approve' || step.action === 'mark_paid' ? approved : null,
    note: check.note,
    createdAt: step.at,
  };
  return {
    ...request,
    status: check.to,
    approved,
    paidOn: step.action === 'mark_paid' ? check.paidOn : request.paidOn,
    updatedAt: step.at,
    events: [...request.events, event],
  };
}

// ---------------------------------------------------------------------------
// Hebrew labels
// ---------------------------------------------------------------------------

export const STATUS_META: Readonly<Record<PaymentStatus, { label: string; tone: BadgeTone; hint: string }>> = {
  pending_review: { label: 'ממתין לבדיקת המנהל', tone: 'warning', hint: 'מנהל הפרויקט בודק שהעבודה בוצעה ושהסכום תואם לחוזה.' },
  pending_client: { label: 'ממתין לאישור הלקוח', tone: 'brand', hint: 'המנהל בדק ואישר. עכשיו תורכם לאשר את התשלום.' },
  approved: { label: 'אושר לתשלום', tone: 'info', hint: 'אושר על ידי המנהל והלקוח. סמנו כששולם לקבלן.' },
  paid: { label: 'שולם', tone: 'success', hint: 'שולם ונרשם בתקציב מול הביצוע.' },
  rejected: { label: 'נדחה', tone: 'danger', hint: 'הבקשה נדחתה בבדיקה. הקבלן מגיש בקשה חדשה.' },
  cancelled: { label: 'בוטל', tone: 'neutral', hint: 'הבקשה בוטלה.' },
};

export const ACTION_META: Readonly<Record<PaymentAction, { label: string; done: string; tone: 'primary' | 'secondary' | 'outline' | 'ghost' }>> = {
  review_approve: { label: 'בדקתי, להעביר לאישור הלקוח', done: 'הבקשה עברה לאישור הלקוח', tone: 'primary' },
  review_reject: { label: 'דחייה', done: 'הבקשה נדחתה', tone: 'ghost' },
  client_approve: { label: 'אישור התשלום', done: 'אישרתם את התשלום', tone: 'primary' },
  client_return: { label: 'יש לי שאלה למנהל', done: 'הבקשה חזרה למנהל עם השאלה שלכם', tone: 'outline' },
  mark_paid: { label: 'סימון כשולם', done: 'התשלום נרשם בתקציב', tone: 'secondary' },
  cancel: { label: 'ביטול הבקשה', done: 'הבקשה בוטלה', tone: 'ghost' },
};

/** The audit line for an event (neutral Hebrew: no gendered verbs). */
export const EVENT_LABEL: Readonly<Record<PaymentEventView['action'], string>> = {
  requested: 'נרשמה בקשת תשלום',
  review_approve: 'נבדקה ואושרה על ידי המנהל',
  review_reject: 'נדחתה בבדיקה',
  client_approve: 'אושרה על ידי הלקוח',
  client_return: 'הוחזרה לבדיקה עם שאלה',
  mark_paid: 'סומנה כשולמה',
  cancel: 'בוטלה',
};

export const TRANSITION_ERROR_MESSAGE: Readonly<Record<TransitionError, string>> = {
  role: 'הפעולה הזאת שמורה לצד השני בתהליך.',
  state: 'הבקשה כבר לא במצב הזה. רעננו את העמוד.',
  note_required: 'כתבו כמה מילים: מה הסיבה, או מה לבדוק.',
  amount: 'הסכום המאושר חייב להיות חיובי, ולא יותר מהסכום שהקבלן ביקש.',
  date: 'תאריך התשלום לא יכול להיות בעתיד.',
};
