/**
 * Lead readers for the Command Center: raw leads rows -> LeadFact. Pure and
 * client-safe; no contact details ever leave this module.
 *
 * The revenue squad stores a scored project file in leads.payload.project_file
 * (docs/platform/PROGRAM.md §6). Until it lands, every read here is defensive:
 * a missing or malformed field is null, never an error.
 * TODO(revenue): confirm the score path. Read today, in order:
 *   payload.project_file.score            number | { value | score | total, reasons? }
 *   payload.project_file.score_reasons    string[]   (also scoreReasons)
 *   payload.score                         number
 */
import type { Json, LeadStatus, LeadType } from '@/lib/db/types';
import { formatBudgetRange } from './format';
import { SOURCE_MEDIUM_LABELS, stageKey } from './dimensions';
import type { LeadFact, LeadSource } from './types';

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
}

function str(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function strings(value: unknown, max = 6): string[] {
  return Array.isArray(value) ? value.map((v) => str(v, 160)).filter((v): v is string => Boolean(v)).slice(0, max) : [];
}

export type LeadScore = { score: number | null; reasons: string[] };

export function readLeadScore(payload: unknown): LeadScore {
  const p = obj(payload);
  const file = obj(p.project_file);
  const raw = file.score;
  let score: number | null = null;
  let reasons: string[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Obj;
    score = num(o.value) ?? num(o.score) ?? num(o.total);
    reasons = strings(o.reasons);
  } else {
    score = num(raw);
  }
  if (score == null) score = num(p.score);
  if (!reasons.length) reasons = strings(file.score_reasons).length ? strings(file.score_reasons) : strings(file.scoreReasons);
  if (score != null) score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons: score == null ? [] : reasons };
}

export type ProjectFileLite = {
  stage: string | null;
  regionSlug: string | null;
  sizeM2: number | null;
  budgetRangeNis: [number, number] | null;
  targetMoveIn: string | null;
  questionCount: number;
};

export function readProjectFile(payload: unknown): ProjectFileLite | null {
  const file = obj(obj(payload).project_file);
  if (Object.keys(file).length === 0) return null;
  const range = Array.isArray(file.budgetRangeNis) && file.budgetRangeNis.length === 2 ? file.budgetRangeNis.map(num) : null;
  return {
    stage: str(file.stage, 40),
    regionSlug: str(file.regionSlug, 60),
    sizeM2: num(file.sizeM2),
    budgetRangeNis: range && range[0] != null && range[1] != null ? [range[0], range[1]] : null,
    targetMoveIn: str(file.targetMoveIn, 10),
    questionCount: Array.isArray(file.questions) ? file.questions.length : 0,
  };
}

/** The lead's source: stored 4h last touch, else its UTMs, else direct. */
export function leadSource(row: { attribution?: Json | null; utm?: Json | null }): LeadSource {
  const a = obj(row.attribution);
  const medium = a.medium;
  if (medium === 'partner' || medium === 'ai_source' || medium === 'campaign' || medium === 'referral') {
    const source = str(a.source);
    const campaign = str(a.campaign, 120);
    return { medium, source, campaign, label: sourceLabel(medium, source, campaign) };
  }
  const utm = obj(row.utm);
  const utmSource = str(utm.utm_source, 120);
  if (utmSource) {
    const campaign = str(utm.utm_campaign, 120);
    return { medium: 'campaign', source: utmSource, campaign, label: sourceLabel('campaign', utmSource, campaign) };
  }
  return { medium: 'direct', source: null, campaign: null, label: SOURCE_MEDIUM_LABELS.direct };
}

function contentRefLabel(ref: string | null): string {
  if (!ref) return 'תוכן';
  if (ref.startsWith('video:')) return 'סרטון';
  if (ref.startsWith('post:')) return 'מאמר';
  if (ref.startsWith('podcast:')) return 'פודקאסט';
  return 'תוכן';
}

export function sourceLabel(medium: LeadSource['medium'], source: string | null, campaign: string | null): string {
  if (medium === 'ai_source') return `${contentRefLabel(source)} בתשובה`;
  if (medium === 'direct') return SOURCE_MEDIUM_LABELS.direct;
  const what = [source, campaign ? `(${campaign})` : null].filter(Boolean).join(' ');
  return what ? `${SOURCE_MEDIUM_LABELS[medium]}: ${what}` : SOURCE_MEDIUM_LABELS[medium];
}

function pathOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url, 'https://local.invalid').pathname).slice(0, 300);
  } catch {
    return url.split('?')[0].slice(0, 300) || null;
  }
}

/** The leads columns the dashboard reads (never names, emails or phones). */
export type RawLeadRow = {
  id: string;
  ref: string;
  type: LeadType;
  status: LeadStatus;
  created_at: string;
  construction_stage: string | null;
  region_id: string | null;
  payload: Json;
  utm: Json;
  attribution: Json | null;
  source_url: string | null;
  service_plan_id: string | null;
};

export const LEAD_FACT_COLUMNS =
  'id, ref, type, status, created_at, construction_stage, region_id, payload, utm, attribution, source_url, service_plan_id';

export type LeadFactContext = {
  regionSlugById: ReadonlyMap<string, string>;
  planSlugById: ReadonlyMap<string, string>;
  firstResponseAt: ReadonlyMap<string, string>;
};

export function toLeadFact(row: RawLeadRow, ctx: LeadFactContext): LeadFact {
  const payload = obj(row.payload);
  const file = readProjectFile(row.payload);
  const { score, reasons } = readLeadScore(row.payload);
  const regionSlug =
    file?.regionSlug ?? (row.region_id ? ctx.regionSlugById.get(row.region_id) ?? null : null) ?? str(payload.region, 60);
  const sizeM2 = file?.sizeM2 ?? num(payload.size_sqm) ?? num(payload.sizeM2);
  const budgetLabel = file?.budgetRangeNis
    ? formatBudgetRange(file.budgetRangeNis)
    : str(payload.budget_band, 60) ?? str(payload.budget, 60);
  return {
    id: row.id,
    ref: row.ref,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    firstResponseAt: ctx.firstResponseAt.get(row.id) ?? null,
    stage: stageKey(file?.stage) ?? stageKey(row.construction_stage),
    regionSlug,
    sizeM2: sizeM2 != null && sizeM2 > 0 ? Math.round(sizeM2) : null,
    budgetLabel,
    score,
    scoreReasons: reasons,
    planSlug: row.service_plan_id ? ctx.planSlugById.get(row.service_plan_id) ?? null : null,
    source: leadSource(row),
    sourcePath: pathOf(row.source_url),
  };
}

/** Lead statuses that still hold pipeline value (the legacy in_progress is "contacted"). */
export const OPEN_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>(['new', 'contacted', 'in_progress']);
export const WON_LEAD_STATUSES: ReadonlySet<LeadStatus> = new Set<LeadStatus>(['won', 'qualified']);

export function isOpenLead(lead: Pick<LeadFact, 'status'>): boolean {
  return OPEN_LEAD_STATUSES.has(lead.status);
}

export function isCountableLead(lead: Pick<LeadFact, 'status'>): boolean {
  return lead.status !== 'spam';
}
