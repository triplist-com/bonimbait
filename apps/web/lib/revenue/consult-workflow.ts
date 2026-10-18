/**
 * The consult queue's workflow ("תור הייעוצים"), on top of the shared lead
 * status (new -> contacted -> won | lost) and leads.booked_at:
 *
 *   queue      בתור             new, not booked: call them
 *   booked     נקבעה פגישה      booked (Calendly or by phone), still open
 *   contacted  בטיפול           talked, no meeting booked yet
 *   won        הצטרפו למסלול    joined a paid plan
 *   lost       לא רלוונטי
 *
 * Quick actions map onto status + booked_at, so the command center and the
 * shared inbox read the same facts. Pure and client-safe (unit-tested).
 */
import type { BadgeTone } from '@/components/ui/Badge';
import type { LeadStatus } from '@/lib/db/types';

export type ConsultStage = 'queue' | 'booked' | 'contacted' | 'won' | 'lost' | 'spam';

export const CONSULT_TABS: readonly ConsultStage[] = ['queue', 'booked', 'contacted', 'won', 'lost'];

export const CONSULT_STAGES: Record<ConsultStage, { label: string; tone: BadgeTone; hint: string }> = {
  queue: { label: 'בתור', tone: 'brand', hint: 'עוד לא דיברנו איתם' },
  booked: { label: 'נקבעה פגישה', tone: 'info', hint: 'הפגישה ביומן' },
  contacted: { label: 'בטיפול', tone: 'warning', hint: 'דיברנו, עוד אין פגישה' },
  won: { label: 'הצטרפו למסלול', tone: 'success', hint: 'סגרנו' },
  lost: { label: 'לא רלוונטי', tone: 'neutral', hint: 'לא מתאים כרגע' },
  spam: { label: 'ספאם', tone: 'danger', hint: '' },
};

type LeadState = { status: LeadStatus; booked_at: string | null };

export function consultStageOf(lead: LeadState): ConsultStage {
  switch (lead.status) {
    case 'spam':
      return 'spam';
    case 'won':
    case 'qualified':
      return 'won';
    case 'lost':
    case 'closed':
      return 'lost';
    default:
      if (lead.booked_at) return 'booked';
      return lead.status === 'contacted' || lead.status === 'in_progress' ? 'contacted' : 'queue';
  }
}

export type ConsultAction = 'book' | 'contacted' | 'won' | 'lost' | 'requeue';

export const CONSULT_ACTIONS: Record<ConsultAction, { label: string; done: string }> = {
  book: { label: 'נקבעה פגישה', done: 'סומן: נקבעה פגישה' },
  contacted: { label: 'דיברנו איתם', done: 'סומן: בטיפול' },
  won: { label: 'הצטרפו למסלול', done: 'סומן: הצטרפו למסלול' },
  lost: { label: 'לא רלוונטי', done: 'סומן: לא רלוונטי' },
  requeue: { label: 'החזרה לתור', done: 'הוחזר לתור' },
};

/** The quick actions offered at each stage, most likely first. */
export function availableActions(stage: ConsultStage): ConsultAction[] {
  switch (stage) {
    case 'queue':
      return ['book', 'contacted', 'lost'];
    case 'booked':
      return ['won', 'lost', 'requeue'];
    case 'contacted':
      return ['book', 'won', 'lost', 'requeue'];
    default:
      return ['requeue'];
  }
}

/** The new status and booking time after a quick action. */
export function applyConsultAction(lead: LeadState, action: ConsultAction, now: Date = new Date()): LeadState {
  switch (action) {
    case 'book':
      // Booked by the team on the phone: that's also a contact.
      return { status: lead.status === 'new' ? 'contacted' : lead.status, booked_at: lead.booked_at ?? now.toISOString() };
    case 'contacted':
      return { status: 'contacted', booked_at: lead.booked_at };
    case 'won':
      return { status: 'won', booked_at: lead.booked_at };
    case 'lost':
      return { status: 'lost', booked_at: lead.booked_at };
    case 'requeue':
      return { status: 'new', booked_at: null };
  }
}

/** PostgREST filters for a tab (consultation leads). */
export function stageFilter(stage: ConsultStage): { status: LeadStatus[]; booked: boolean | null } {
  switch (stage) {
    case 'queue':
      return { status: ['new'], booked: false };
    case 'booked':
      return { status: ['new', 'contacted', 'in_progress'], booked: true };
    case 'contacted':
      return { status: ['contacted', 'in_progress'], booked: false };
    case 'won':
      return { status: ['won', 'qualified'], booked: null };
    case 'lost':
      return { status: ['lost', 'closed'], booked: null };
    case 'spam':
      return { status: ['spam'], booked: null };
  }
}

export function isConsultStage(value: unknown): value is ConsultStage {
  return typeof value === 'string' && value in CONSULT_STAGES;
}

export function isConsultAction(value: unknown): value is ConsultAction {
  return typeof value === 'string' && value in CONSULT_ACTIONS;
}
