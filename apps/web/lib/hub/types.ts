/**
 * Builder Hub ("הבית שלי · תיק פרויקט") types: the domain shapes the UI
 * renders, the anonymous draft (localStorage), the project-file snapshot, and
 * the database types for the hub tables (supabase/migrations/2026101412*_hub_*).
 * Kept out of the shared lib/db/types.ts on purpose (PROGRAM.md §5): use
 * hubDb() in lib/hub/db.ts for a client typed with these tables. Client-safe.
 */
import type { BuildStage } from '@/lib/stages';
import type { CoreField, PlannerEstimate, ProjectFile } from '@/lib/project-file/types';

export type StageId = BuildStage['id'];

/** Ordered stage ids (lib/stages.ts order). */
export const STAGE_IDS: readonly StageId[] = [
  'purchase',
  'planning',
  'permit',
  'frame',
  'infrastructure',
  'finishing',
  'moving-in',
] as const;

export function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (STAGE_IDS as readonly string[]).includes(value);
}

/*
 * The project-file shapes come from the single source of truth, the PROGRAM.md
 * §6 `ProjectFile` in lib/project-file/types.ts (owned by `revenue`).
 */

/**
 * The onboarding answers: the file's five core facts (stage, regionSlug,
 * sizeM2, budgetRangeNis in whole shekels, targetMoveIn as an ISO month).
 * Stored for anonymous visitors in localStorage under `bb.hub.draft` with
 * EXACTLY these fields.
 */
export type HubDraft = Pick<ProjectFile, CoreField>;

/** growth's `bb.planner.last` (PROGRAM.md §6 `plannerEstimate`). */
export type { PlannerEstimate };

/**
 * The hub's part of the project file: the §6 `ProjectFile` minus the fields
 * other squads produce (`questions`, `source`).
 */
export type ProjectFileSnapshot = Omit<ProjectFile, 'questions' | 'source'>;

export type HubMode = 'member' | 'local' | 'demo';

export type SavedKind = 'video' | 'video_page' | 'post' | 'business' | 'answer';
export const SAVED_KINDS: readonly SavedKind[] = ['video', 'video_page', 'post', 'business', 'answer'];

export function isSavedKind(value: unknown): value is SavedKind {
  return typeof value === 'string' && (SAVED_KINDS as readonly string[]).includes(value);
}

export type BudgetItemKind = 'planned' | 'quote' | 'actual';
export type BudgetItemStatus = 'open' | 'accepted' | 'rejected' | 'paid';
export type BudgetBasis = 'calculator' | 'planner' | 'manual' | 'quotes';

export type DocumentCategory = 'plans' | 'permit' | 'quote' | 'contract' | 'receipt' | 'photo' | 'other';

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
/** Matches the hub-docs bucket's file_size_limit. */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Matches hub_row_cap('100') on hub_documents and the upload policy. */
export const DOCUMENT_MAX_PER_PROJECT = 100;

// ---------------------------------------------------------------------------
// View models (what the dashboard renders; plain JSON so demo and local modes
// can build them in the browser)
// ---------------------------------------------------------------------------

export interface HubProjectView {
  id: string | null;
  title: string;
  stage: StageId | null;
  regionSlug: string | null;
  regionName: string | null;
  sizeM2: number | null;
  budgetRangeNis: [number, number] | null;
  targetMoveIn: string | null;
  onboarded: boolean;
  mode: 'self' | 'managed';
}

export interface HubEstimate {
  totalMin: number;
  totalMax: number;
  basis: 'calculator' | 'planner';
  /** ISO timestamp of the planner run, when the basis is the planner. */
  at?: string;
  inputs: Record<string, unknown>;
}

export interface HubBudgetVersionView {
  id: string | null;
  versionNo: number;
  label: string;
  basis: BudgetBasis;
  totalMin: number;
  totalMax: number;
  createdAt: string;
  /** Planned amount per category, whole shekels. */
  planned: Partial<Record<string, number>>;
}

export interface HubBudgetItemView {
  id: string;
  kind: Exclude<BudgetItemKind, 'planned'>;
  category: string;
  label: string | null;
  vendor: string | null;
  /** Whole shekels. */
  amount: number;
  status: BudgetItemStatus | null;
  occurredOn: string | null;
  createdAt: string;
}

export interface HubSavedItemView {
  kind: SavedKind;
  ref: string;
  title: string;
  href: string;
  thumbnail: string | null;
  savedAt: string;
}

export interface HubProView {
  id: string;
  slug: string;
  name: string;
  specialty: string | null;
  logoUrl: string | null;
  ratingPercent: number | null;
  reviewCount: number;
}

export interface HubContactView {
  ref: string | null;
  type: string;
  businessName: string | null;
  businessSlug: string | null;
  createdAt: string;
}

export interface HubDocumentView {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategory;
  stage: StageId | null;
  note: string | null;
  createdAt: string;
}

export interface HubTaskView {
  id: string;
  title: string;
  dueOn: string | null;
  done: boolean;
  stage: StageId | null;
}

export interface StagePickVideo {
  youtubeId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  kind: 'video' | 'podcast' | 'live';
}

export interface StagePickArticle {
  slug: string;
  title: string;
  excerpt: string | null;
  image: string | null;
}

export interface StagePicks {
  videos: StagePickVideo[];
  articles: StagePickArticle[];
}

export type StagePicksMap = Record<StageId, StagePicks>;

/** Everything the dashboard needs, in every mode. */
export interface HubViewData {
  mode: HubMode;
  /** YYYY-MM-DD in Israel. */
  today: string;
  project: HubProjectView;
  checklistDone: string[];
  estimate: HubEstimate | null;
  budgetVersion: HubBudgetVersionView | null;
  budgetItems: HubBudgetItemView[];
  saved: HubSavedItemView[];
  shortlist: HubProView[];
  contacts: HubContactView[];
  documents: HubDocumentView[];
  tasks: HubTaskView[];
  picks: StagePicksMap;
  file: ProjectFileSnapshot;
  /** Advisor questions asked (demo fixture); otherwise read from bb.advisor.recent in the browser. */
  advisorQuestions?: number;
}

// ---------------------------------------------------------------------------
// Database types (same shape as `supabase gen types`)
// ---------------------------------------------------------------------------

export type HubProjectRow = {
  id: string;
  created_by: string;
  title: string | null;
  stage: StageId | null;
  region_id: string | null;
  size_m2: number | null;
  budget_min_agorot: number | null;
  budget_max_agorot: number | null;
  target_move_in: string | null;
  mode: 'self' | 'managed';
  status: 'active' | 'completed' | 'archived';
  onboarded_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type HubProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: 'owner' | 'manager';
  added_by: string | null;
  created_at: string;
};

export type HubChecklistStateRow = {
  project_id: string;
  item_id: string;
  done: boolean;
  done_at: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type HubBudgetVersionRow = {
  id: string;
  project_id: string;
  version_no: number;
  label: string;
  basis: BudgetBasis;
  total_min_agorot: number | null;
  total_max_agorot: number | null;
  inputs: Record<string, unknown>;
  note: string | null;
  is_current: boolean;
  created_by: string | null;
  created_at: string;
};

export type HubBudgetItemRow = {
  id: string;
  project_id: string;
  version_id: string | null;
  kind: BudgetItemKind;
  category: string;
  label: string | null;
  amount_agorot: number;
  vendor: string | null;
  business_id: string | null;
  status: BudgetItemStatus | null;
  occurred_on: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HubSavedItemRow = {
  id: string;
  project_id: string;
  kind: SavedKind;
  ref: string;
  title: string | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type HubDocumentRow = {
  id: string;
  project_id: string;
  storage_path: string;
  file_name: string;
  mime_type: DocumentMimeType;
  size_bytes: number;
  category: DocumentCategory;
  stage: StageId | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type HubTaskRow = {
  id: string;
  project_id: string;
  title: string;
  due_on: string | null;
  done: boolean;
  done_at: string | null;
  stage: StageId | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** hub_staff_aggregates() result (supabase/migrations/20261014121200_hub_aggregates.sql). */
export interface HubStaffAggregates {
  generated_at: string;
  days: number;
  projects: number;
  onboarded: number;
  members: number;
  managed: number;
  onboarded_7d: number;
  onboarded_period: number;
  by_stage: Array<{ stage: StageId | 'unknown'; projects: number }>;
  by_region: Array<{ region: string; name: string; projects: number }>;
  by_budget_band: Array<{ band: string; projects: number }>;
  by_size_band: Array<{ band: string; projects: number }>;
  by_move_in: Array<{ band: string; projects: number }>;
  onboarding_daily: Array<{ day: string; onboarded: number }>;
}

type Table<Row, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type HubDatabase = {
  public: {
    Tables: {
      hub_projects: Table<HubProjectRow, 'created_by', 'id'>;
      hub_project_members: Table<HubProjectMemberRow, 'project_id' | 'user_id' | 'role'>;
      hub_checklist_state: Table<HubChecklistStateRow, 'project_id' | 'item_id'>;
      hub_budget_versions: Table<HubBudgetVersionRow, 'project_id' | 'version_no' | 'label', 'id'>;
      hub_budget_items: Table<HubBudgetItemRow, 'project_id' | 'kind' | 'category' | 'amount_agorot', 'id'>;
      hub_saved_items: Table<HubSavedItemRow, 'project_id' | 'kind' | 'ref', 'id'>;
      hub_documents: Table<
        HubDocumentRow,
        'project_id' | 'storage_path' | 'file_name' | 'mime_type' | 'size_bytes',
        'id'
      >;
      hub_tasks: Table<HubTaskRow, 'project_id' | 'title', 'id'>;
      regions: {
        Row: { id: string; slug: string; name: string; is_nationwide: boolean; sort_order: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      hub_new_budget_version: {
        Args: {
          p_project: string;
          p_label: string;
          p_basis: BudgetBasis;
          p_total_min: number | null;
          p_total_max: number | null;
          p_inputs?: Record<string, unknown>;
          p_note?: string | null;
          p_planned?: Array<{ category: string; amount_agorot: number; label?: string }>;
        };
        Returns: string;
      };
      hub_staff_aggregates: { Args: { p_days?: number }; Returns: HubStaffAggregates };
      hub_my_contacts: {
        Args: { p_limit?: number };
        Returns: Array<{
          lead_ref: string | null;
          lead_type: string;
          business_id: string | null;
          business_name: string | null;
          business_slug: string | null;
          created_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
