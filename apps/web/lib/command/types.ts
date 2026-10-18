/**
 * Command Center ("חדר הבקרה") data shapes. Everything here is plain JSON, so
 * the same view model renders real data in /admin and fixtures in
 * /platform/demo/command/ (docs/platform/FOUNDATION.md §2).
 *
 *   raw inputs (CommandInputs)  ->  buildCommandCenter()  ->  CommandCenterData
 *   lib/command/load.ts (DB)        lib/command/build.ts       components/command/*
 *   lib/demo/fixtures/command.ts
 */
import type { LeadStatus, LeadType } from '@/lib/db/types';
import type { CoverageLevel, CoverageLevelSource } from './db-types';

export type { CoverageLevel, CoverageLevelSource };

export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];

export type Point = { date: string; value: number };

/** Change of one measure against the previous period. pct is null without a baseline. */
export type Delta = { current: number; previous: number; pct: number | null; direction: 'up' | 'down' | 'flat' };

// ---------------------------------------------------------------------------
// Raw inputs
// ---------------------------------------------------------------------------

/** Where a lead came from (4h last-touch attribution, UTMs, or the form it used). */
export type LeadSourceMedium = 'partner' | 'ai_source' | 'campaign' | 'referral' | 'direct';

export type LeadSource = {
  medium: LeadSourceMedium;
  /** partner id, '<kind>:<id>' content ref, utm_source or referrer host. */
  source: string | null;
  campaign: string | null;
  /** Hebrew one-liner for lists. */
  label: string;
};

/** One lead, reduced to what the dashboard needs. No contact details. */
export type LeadFact = {
  id: string;
  ref: string;
  type: LeadType;
  status: LeadStatus;
  createdAt: string;
  /** First status change (lead_status_events); null when untouched or before tracking began. */
  firstResponseAt: string | null;
  /** Stage bucket key (see lib/command/dimensions.ts). */
  stage: string | null;
  regionSlug: string | null;
  sizeM2: number | null;
  /** Budget as the builder gave it, already formatted ("₪1.5M–2M", "1.5 עד 2 מיליון ₪"). */
  budgetLabel: string | null;
  /** 0-100 from the revenue squad's scoring (leads.score); null until scored. */
  score: number | null;
  scoreReasons: string[];
  /** When the consultation was booked (leads.booked_at: Calendly or the consult team); null = not booked. */
  bookedAt?: string | null;
  /** service_plans.slug for service_plan leads. */
  planSlug: string | null;
  source: LeadSource;
  /** Page the form was sent from (pathname). */
  sourcePath: string | null;
};

export type PlanFact = {
  slug: string;
  name: string;
  /** Typical price ex-VAT in agorot (the middle of its price tiers); null when unpriced. */
  priceAgorot: number | null;
  sortOrder: number;
};

export type OrderFact = {
  id: string;
  createdAt: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
  totalAgorot: number;
  /** Plan lines of the order (order_items.service_plan_price_id -> plan). */
  planItems: { planSlug: string; totalAgorot: number }[];
};

/** platform_daily_counts row: one event name on one Israel day. */
export type DailyEventCount = { day: string; name: string; events: number; visitors: number };

/** ai_usage, summed per UTC day (the budget day). */
export type AiUsageDay = { day: string; costUsd: number; calls: number; answerCalls: number };

export type PartnerTierId = 'members' | 'partners' | 'ambassadors';

/** A partner's live tier terms (partner_subscriptions + partner_tiers, revenue squad). */
export type PartnerTierInfo = {
  label: string;
  /** What this partner pays per month (locked at purchase), whole shekels. */
  monthlyPriceNis: number;
  /** Viewable impressions per 30 days the tier promises; null = no target. */
  monthlyImpressionTarget: number | null;
};

export type PartnerFact = {
  id: string;
  name: string;
  tier: PartnerTierId | null;
  /** Live terms from the partner's subscription; when absent, PARTNER_TIERS defaults apply. */
  tierInfo?: PartnerTierInfo | null;
  impressions: number;
  clicks: number;
  leads: number;
  prevImpressions: number;
  prevClicks: number;
  prevLeads: number;
};

export type ExpectedValue = {
  /** 'type:<lead type>' or 'plan:<plan slug>'. */
  key: string;
  group: 'plan' | 'type';
  label: string;
  dealValueAgorot: number;
  /** 0..1 */
  closeRate: number;
  note: string | null;
  /** True when no admin override replaced the default. */
  isDefault: boolean;
};

export type NearestContent = {
  kind: 'video' | 'post';
  id: string;
  title: string;
  href: string;
  similarity: number;
  /** Seconds into the video of the best-matching moment. */
  startS?: number | null;
};

export type InsightTopic = {
  id: string;
  rank: number;
  label: string;
  suggestedTitle: string | null;
  asks: number;
  visitors: number;
  questionCount: number;
  asksThisWeek: number;
  asksPrevWeek: number;
  trendPct: number | null;
  /** 0..1, from the best source similarity (lib/command/insights/coverage.ts). */
  coverage: number;
  topSimilarity: number;
  level: CoverageLevel;
  levelSource: CoverageLevelSource;
  levelReason: string | null;
  avgConfidence: number | null;
  examples: { q: string; asks: number }[];
  nearest: NearestContent[];
};

export type InsightRunSummary = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  questionCount: number;
  askCount: number;
  topicCount: number;
  costUsd: number;
  message: string | null;
};

/** A raw question with its volume (fallback list before the first insight run). */
export type QuestionFact = {
  question: string;
  asks: number;
  asksThisWeek: number;
  avgConfidence: number | null;
  zeroSourceAnswers: number;
  lastSeen: string;
};

export type PendingCounts = {
  newLeads: number;
  pendingReviews: number;
  pendingBusinesses: number;
  openRequests: number;
};

/**
 * The hub's staff aggregates (hub_staff_aggregates() RPC, migration
 * 20261014121200): member projects only, never a single builder's details.
 */
export type HubFacts = {
  /** Member projects onboarded in the current period, and in the period before. */
  onboarded: number;
  prevOnboarded: number;
  /** Live (not archived) member projects, onboarded or not. */
  projects: number;
  /** Onboarded projects per stage (lib/stages.ts ids, plus 'unknown'). */
  byStage: Array<{ stage: string; projects: number }>;
};

export type CommandInputs = {
  /** ISO instant the dashboard is computed for. */
  now: string;
  periodDays: PeriodDays;
  /** Leads created in the current and previous periods. */
  leads: LeadFact[];
  plans: PlanFact[];
  orders: OrderFact[];
  /** Daily counts for the current and previous periods. */
  events: DailyEventCount[];
  aiUsage: AiUsageDay[];
  aiBudgetUsd: number;
  aiSpentTodayUsd: number;
  partners: PartnerFact[];
  expectedValues: ExpectedValue[];
  /** Latest insight run; null before the first refresh. */
  insights: { run: InsightRunSummary; topics: InsightTopic[] } | null;
  topQuestions: QuestionFact[];
  regionNames: Record<string, string>;
  pending: PendingCounts | null;
  /** The hub's aggregates; null when unavailable (migration missing, not staff). */
  hub?: HubFacts | null;
};

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

/** One step of the builders' journey across the pillars, in the period. */
export type JourneyStep = {
  id: 'questions' | 'planner' | 'maps' | 'consult_requests' | 'consults_booked';
  label: string;
  /** Which pillar produces it, for the caption ("היועץ", "מתכנן התקציב"...). */
  source: string;
  value: Delta;
};

export type HotLead = {
  id: string;
  ref: string;
  /** Admin lead page; null in the demo. */
  href: string | null;
  type: LeadType;
  typeLabel: string;
  status: LeadStatus;
  score: number | null;
  band: ScoreBandId;
  scoreReasons: string[];
  stageLabel: string | null;
  regionName: string | null;
  sizeM2: number | null;
  budgetLabel: string | null;
  sourceLabel: string;
  minutesAgo: number;
  expectedValueAgorot: number;
};

export type ScoreBandId = 'hot' | 'warm' | 'mild' | 'cold' | 'none';

export type PlanMixRow = {
  slug: string;
  name: string;
  leads: number;
  orders: number;
  paidAgorot: number;
  expectedValueAgorot: number;
};

export type PartnerHealthStatus = 'on_track' | 'behind' | 'at_risk' | 'no_tier';

export type PartnerHealth = {
  id: string;
  name: string;
  tier: PartnerTierId | null;
  tierLabel: string | null;
  monthlyPriceNis: number | null;
  impressions: number;
  impressionsTarget: number | null;
  clicks: number;
  ctr: number | null;
  leads: number;
  leadsDelta: Delta;
  /** Delivered / pro-rated target, 0..; null without a tier. */
  pace: number | null;
  costPerLeadNis: number | null;
  status: PartnerHealthStatus;
};

export type UnansweredItem = {
  id: string;
  label: string;
  example: string | null;
  asks: number;
  trendPct: number | null;
  level: CoverageLevel | null;
  suggestedTitle: string | null;
};

export type CommandCenterData = {
  isDemo: boolean;
  generatedAt: string;
  period: { days: PeriodDays; from: string; to: string; prevFrom: string; prevTo: string };
  /** Too little real data to read anything into it (the admin then offers the demo). */
  sparse: boolean;
  pipeline: {
    openAgorot: number;
    openCount: number;
    createdAgorot: number;
    createdDelta: Delta;
    wonAgorot: number;
    byGroup: { key: string; label: string; count: number; openAgorot: number }[];
  };
  consults: {
    booked: Delta;
    requests: Delta;
    daily: Point[];
  };
  planMix: { rows: PlanMixRow[]; totalLeads: number; totalOrders: number; paidAgorot: number; paidDelta: Delta };
  topLeads: { hotCount: Delta; scoredShare: number; avgScore: number | null; top: HotLead[]; usesScores: boolean };
  partners: {
    active: number;
    onTrack: number;
    behind: number;
    atRisk: number;
    impressions: Delta;
    clicks: Delta;
    leads: Delta;
    rows: PartnerHealth[];
  };
  ai: {
    budgetUsd: number;
    spentTodayUsd: number;
    capShare: number;
    capStatus: 'ok' | 'near' | 'reached' | 'off';
    cost: Delta;
    questions: Delta;
    costPerQuestionUsd: number | null;
    daysAtCap: number;
    dailyCost: Point[];
    dailyQuestions: Point[];
  };
  leads: { total: Delta; daily: Point[] };
  /**
   * The builders' journey in the period, one number per pillar: questions to
   * the advisor, planner results, personal roadmaps, consult requests and
   * bookings, plus the hub's member projects (its staff aggregates).
   */
  journey: {
    steps: JourneyStep[];
    hub: { joined: Delta; projects: number; topStages: Array<{ stage: string; label: string; share: number }> } | null;
  };
  hotLeads: HotLead[];
  unanswered: {
    source: 'insights' | 'questions' | 'none';
    /** Gap and partial asks in the run window (or raw low-confidence asks). */
    totalAsks: number;
    items: UnansweredItem[];
    runAt: string | null;
  };
  pending: PendingCounts | null;
};
