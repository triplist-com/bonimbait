/**
 * The project file: how every lead and consult booking carries context (the
 * money link). Owned by the `revenue` squad; other squads import the TYPE only.
 * Contract: docs/platform/PROGRAM.md §6 "Project file contract".
 *
 * Stages are the owner's 7, ids from lib/stages.ts (BuildStage['id']):
 * purchase | planning | permit | frame | infrastructure | finishing | moving-in.
 *
 * Client-safe (types and constants only).
 */
import type { BuildStage } from '@/lib/stages';

export interface ProjectFile {
  version: 1;
  stage?: BuildStage['id'];
  regionSlug?: string; // regions.slug (14 canonical)
  sizeM2?: number;
  budgetRangeNis?: [number, number]; // whole shekels
  targetMoveIn?: string; // ISO month, e.g. '2027-09'
  questions?: { q: string; at: string }[]; // last <= 10 advisor questions
  plannerEstimate?: { totalMin: number; totalMax: number; at: string; inputs: Record<string, unknown> };
  savedCount?: number;
  shortlistBusinessIds?: string[];
  source?: { utm?: Record<string, string>; landing?: string; lastTouch?: string };
}

export type ProjectStageId = BuildStage['id'];
export type ProjectQuestion = NonNullable<ProjectFile['questions']>[number];
export type PlannerEstimate = NonNullable<ProjectFile['plannerEstimate']>;
export type ProjectSource = NonNullable<ProjectFile['source']>;

/**
 * localStorage snapshots written by the producing squads (anonymous visitors;
 * the server is the source of truth for members).
 */
export const PROJECT_FILE_STORAGE_KEYS = {
  /** hub: the onboarding answers (stage, regionSlug, sizeM2, budgetRangeNis, targetMoveIn). */
  hubDraft: 'bb.hub.draft',
  /** growth: plannerEstimate. */
  plannerLast: 'bb.planner.last',
  /** advisor: { q, at }[], the last 10 questions. */
  advisorRecent: 'bb.advisor.recent',
  /** hub: business ids. */
  shortlist: 'bb.shortlist',
} as const;

/** sessionStorage key where lib/analytics/track.ts keeps the landing UTMs. */
export const SESSION_UTM_KEY = 'bb_utm';

/** The five onboarding facts that make a file "complete". */
export const CORE_FIELDS = ['stage', 'regionSlug', 'sizeM2', 'budgetRangeNis', 'targetMoveIn'] as const;
export type CoreField = (typeof CORE_FIELDS)[number];

export const MAX_QUESTIONS = 10;
export const MAX_SHORTLIST = 50;

// ---------------------------------------------------------------------------
// Score (lib/project-file/score.ts)
// ---------------------------------------------------------------------------

export type ScoreGroup = 'budget' | 'stage' | 'completeness' | 'intent';

export type ScoreReason = {
  /** Stable machine code, e.g. 'stage', 'pro_questions'. */
  code: string;
  group: ScoreGroup;
  /** Hebrew, shown as-is in the consult queue ("4 שאלות על אלומיניום"). */
  label: string;
  points: number;
};

export type ScoreBand = 'hot' | 'warm' | 'cool';

export type ProjectScore = {
  version: 1;
  /** 0-100. */
  score: number;
  band: ScoreBand;
  /** Positive contributions, biggest first. */
  reasons: ScoreReason[];
  /** Hebrew names of the core facts the file still lacks ("תקציב", "מועד כניסה"). */
  missing: string[];
};

/** Server-side signals that are not part of the file itself. */
export type ScoreSignals = {
  /** Distinct visits (sessions) of this visitor, including the current one. */
  visits?: number;
};

/** What a scored lead stores: leads.payload.project_file + leads.payload.project_score (+ leads.score). */
export type ProjectFileEnvelope = {
  file: ProjectFile;
  score: ProjectScore;
};
