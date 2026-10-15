/**
 * Bonim.Os ("מערכת הליווי ללקוחות הניהול", P7) types: the database rows of
 * supabase/migrations/20261014126*_bonimos_*.sql, the typed client schema on
 * top of the hub's, and the plain-JSON view models the UI renders. The demo
 * builds the same view models from fixtures. Client-safe; kept out of
 * lib/db/types.ts and lib/hub/types.ts on purpose (PROGRAM.md §5).
 */
import type { BudgetCategoryId, VarianceStatus } from '@/lib/hub/budget';
import type { BudgetBasis, HubBudgetItemView, HubDatabase, HubDocumentView, StageId } from '@/lib/hub/types';

export type ProjectRole = 'owner' | 'manager';

export type PaymentStatus = 'pending_review' | 'pending_client' | 'approved' | 'paid' | 'rejected' | 'cancelled';
export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'pending_review',
  'pending_client',
  'approved',
  'paid',
  'rejected',
  'cancelled',
];

export type PaymentAction = 'review_approve' | 'review_reject' | 'client_approve' | 'client_return' | 'mark_paid' | 'cancel';
export const PAYMENT_ACTIONS: readonly PaymentAction[] = [
  'review_approve',
  'review_reject',
  'client_approve',
  'client_return',
  'mark_paid',
  'cancel',
];
export type PaymentEventAction = 'requested' | PaymentAction;

export type ActivityKind = 'note' | 'payment' | 'budget' | 'milestone' | 'photo' | 'document' | 'team' | 'stage';

export function isPaymentAction(value: unknown): value is PaymentAction {
  return typeof value === 'string' && (PAYMENT_ACTIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Database rows (same shape as `supabase gen types`)
// ---------------------------------------------------------------------------

export type BonimosManagerRow = {
  user_id: string;
  display_name: string;
  title: string;
  phone: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BonimosMilestoneRow = {
  id: string;
  project_id: string;
  stage: StageId;
  title: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  note: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BonimosPaymentRequestRow = {
  id: string;
  project_id: string;
  number: number;
  contractor: string;
  title: string;
  category: BudgetCategoryId;
  stage: StageId | null;
  milestone_id: string | null;
  attachment_id: string | null;
  requested_agorot: number;
  approved_agorot: number | null;
  status: PaymentStatus;
  due_on: string | null;
  paid_on: string | null;
  budget_item_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BonimosPaymentEventRow = {
  id: string;
  request_id: string;
  project_id: string;
  action: PaymentEventAction;
  from_status: PaymentStatus | null;
  to_status: PaymentStatus;
  actor_id: string | null;
  actor_role: ProjectRole | null;
  amount_agorot: number | null;
  note: string | null;
  created_at: string;
};

export type BonimosPhotoRow = {
  id: string;
  project_id: string;
  storage_path: string;
  thumb_path: string;
  width: number;
  height: number;
  size_bytes: number;
  caption: string | null;
  stage: StageId | null;
  taken_on: string;
  uploaded_by: string | null;
  created_at: string;
};

export type BonimosActivityRow = {
  id: string;
  project_id: string;
  actor_id: string | null;
  kind: ActivityKind;
  action: string;
  body: string | null;
  ref_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BonimosPersonRow = {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
};

type Table<Row, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

type HubPublic = HubDatabase['public'];

/** The hub's schema plus the Bonim.Os tables and RPCs (use with lib/bonimos/db.ts). */
export type BonimosDatabase = {
  public: {
    Tables: HubPublic['Tables'] & {
      bonimos_managers: Table<BonimosManagerRow, 'user_id' | 'display_name'>;
      bonimos_milestones: Table<
        BonimosMilestoneRow,
        'project_id' | 'stage' | 'title' | 'planned_start' | 'planned_end',
        'id'
      >;
      bonimos_payment_requests: Table<
        BonimosPaymentRequestRow,
        'project_id' | 'number' | 'contractor' | 'title' | 'category' | 'requested_agorot',
        'id'
      >;
      bonimos_payment_events: Table<BonimosPaymentEventRow, 'request_id' | 'project_id' | 'action' | 'to_status', 'id'>;
      bonimos_photos: Table<
        BonimosPhotoRow,
        'project_id' | 'storage_path' | 'thumb_path' | 'width' | 'height' | 'size_bytes',
        'id'
      >;
      bonimos_activity: Table<BonimosActivityRow, 'project_id', 'id'>;
      profiles: {
        Row: { id: string; email: string | null; full_name: string | null; phone: string | null; role: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: HubPublic['Functions'] & {
      bonimos_request_payment: {
        Args: {
          p_project: string;
          p_contractor: string;
          p_title: string;
          p_category: string;
          p_amount_agorot: number;
          p_milestone?: string | null;
          p_attachment?: string | null;
          p_due_on?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      bonimos_payment_transition: {
        Args: {
          p_request: string;
          p_action: PaymentAction;
          p_amount_agorot?: number | null;
          p_note?: string | null;
          p_paid_on?: string | null;
        };
        Returns: PaymentStatus;
      };
      bonimos_project_people: { Args: { p_projects: string[] }; Returns: BonimosPersonRow[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// View models (plain JSON: the server builds them for members, the demo from
// fixtures, and the same client components render both)
// ---------------------------------------------------------------------------

export interface PersonView {
  userId: string;
  role: ProjectRole;
  name: string;
  /** Managers: "מנהלת פרויקט", "מפקח בנייה". */
  title: string | null;
  /** The manager's phone for the client; the client's phone for a manager. */
  phone: string | null;
  /** The client's email, for their manager only. */
  email: string | null;
}

/** One budget version: the plan by category, whole shekels. */
export interface BudgetVersionPlan {
  id: string;
  versionNo: number;
  label: string;
  basis: BudgetBasis;
  /** Why this version exists ("אחרי מכרז הקבלנים"). */
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  isCurrent: boolean;
  totalMin: number;
  totalMax: number;
  planned: Partial<Record<BudgetCategoryId, number>>;
}

export interface MilestoneView {
  id: string;
  stage: StageId;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  note: string | null;
  sortOrder: number;
}

export interface PaymentEventView {
  id: string;
  action: PaymentEventAction;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  actorId: string | null;
  actorRole: ProjectRole | null;
  /** Whole shekels. */
  amount: number | null;
  note: string | null;
  createdAt: string;
}

export interface PaymentRequestView {
  id: string;
  number: number;
  contractor: string;
  title: string;
  category: BudgetCategoryId;
  stage: StageId | null;
  milestoneId: string | null;
  attachment: { id: string; fileName: string; mimeType: string } | null;
  /** Whole shekels. */
  requested: number;
  approved: number | null;
  status: PaymentStatus;
  dueOn: string | null;
  paidOn: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Oldest first. */
  events: PaymentEventView[];
}

export interface PhotoView {
  id: string;
  /** A signed (members) or static (demo) URL. */
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  caption: string | null;
  stage: StageId | null;
  takenOn: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ActivityView {
  id: string;
  kind: ActivityKind;
  action: string;
  actorId: string | null;
  body: string | null;
  refId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface ManagedProjectInfo {
  id: string;
  title: string;
  stage: StageId | null;
  regionSlug: string | null;
  regionName: string | null;
  sizeM2: number | null;
  targetMoveIn: string | null;
  budgetRangeNis: [number, number] | null;
  mode: 'self' | 'managed';
}

/** Everything the managed project view renders, for the manager and the client alike. */
export interface ManagedProjectData {
  mode: 'member' | 'demo';
  viewer: { userId: string; role: ProjectRole };
  /** YYYY-MM-DD in Israel. */
  today: string;
  /** ISO timestamp the data was read at (relative times use it, so SSR and hydration agree). */
  now: string;
  project: ManagedProjectInfo;
  people: PersonView[];
  /** Oldest first; the last current one is the approved budget. */
  versions: BudgetVersionPlan[];
  /** Quotes and actuals (not planned lines), newest first. */
  budgetItems: HubBudgetItemView[];
  milestones: MilestoneView[];
  /** Newest first. */
  payments: PaymentRequestView[];
  documents: HubDocumentView[];
  /** Newest first (taken_on, then upload time). */
  photos: PhotoView[];
  /** Newest first. */
  activity: ActivityView[];
  /**
   * growth's planner estimate for this house (estimateFromProfile on the
   * current price book), split into budget categories: the manager's
   * starting point for an approved budget.
   */
  baseline: { plan: Partial<Record<BudgetCategoryId, number>>; total: number; validAsOf: string } | null;
}

/** One row of the manager's workspace (/manage/). */
export interface ManagerProjectSummary {
  id: string;
  title: string;
  clientName: string;
  regionName: string | null;
  sizeM2: number | null;
  stage: StageId | null;
  budget: {
    versionNo: number | null;
    /** The current version's plan, whole shekels. */
    approved: number;
    forecast: number;
    variance: number;
    variancePct: number | null;
    status: VarianceStatus;
  };
  nextMilestone: { id: string; title: string; stage: StageId; plannedEnd: string; daysLeft: number; late: boolean } | null;
  approvals: { pendingReview: number; pendingClient: number; approvedUnpaid: number };
  lastActivityAt: string | null;
}

/** The managed-client band on the client's own hub (/my-home/). */
export interface ManagedHubSummary {
  projectId: string;
  managers: PersonView[];
  budget: ManagerProjectSummary['budget'] | null;
  nextMilestone: ManagerProjectSummary['nextMilestone'];
  /** Requests waiting for the client's approval. */
  waitingForYou: number;
  photosThisWeek: number;
}
