/**
 * Defensive parsing for the project file.
 *
 * The file is assembled from snapshots other squads write in parallel
 * (localStorage, the hub's member snapshot), and the browser sends it to the
 * server, so every value is treated as untrusted: `sanitizeProjectFile(x)`
 * accepts anything and returns a valid ProjectFile (unknown or invalid values
 * are dropped, never thrown on). It also reads the likely variants of each
 * field (snake_case DB columns, `{ min, max }` ranges, `{ question }` items),
 * so a producer that drifts from the contract still feeds the file.
 *
 * Pure and client-safe.
 */
import { BUILD_STAGES, stageForProfile } from '@/lib/stages';
import { REGIONS } from '@/lib/constants/community';
import type { ConstructionStage } from '@/lib/db/types';
import {
  MAX_QUESTIONS,
  MAX_SHORTLIST,
  type PlannerEstimate,
  type ProjectFile,
  type ProjectQuestion,
  type ProjectSource,
  type ProjectStageId,
} from './types';

type Obj = Record<string, unknown>;

const STAGE_IDS = new Set<string>(BUILD_STAGES.map((s) => s.id));
const REGION_SLUGS = new Set<string>(REGIONS.map((r) => r.slug));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d(?:[\s.-]?\d){8,}/g;

export const SIZE_RANGE = { min: 20, max: 5000 } as const;
export const BUDGET_RANGE = { min: 50_000, max: 100_000_000 } as const;
const MAX_QUESTION_CHARS = 300;
const MAX_INPUT_KEYS = 20;

function isObj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** First defined value among `keys` of `o`. */
function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/[,\s₪]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function cleanText(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Questions are typed by visitors: never keep an email or a phone number from them. */
export function redactQuestion(value: string): string {
  return cleanText(value.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]'), MAX_QUESTION_CHARS);
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const t = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(t)) return null;
  // Plausible window only: no epoch zeros, nothing far in the future.
  if (t < Date.UTC(2020, 0, 1) || t > Date.now() + 86_400_000) return null;
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** A BuildStage id from an id, a profile stage ('tender', 'moving_in') or a Hebrew label. */
export function toStageId(value: unknown): ProjectStageId | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const v = value.trim();
  if (STAGE_IDS.has(v)) return v as ProjectStageId;
  const fromProfile = stageForProfile(v as ConstructionStage);
  if (fromProfile) return fromProfile.id;
  return BUILD_STAGES.find((s) => s.label === v || s.title === v)?.id;
}

export function toRegionSlug(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const v = value.trim().normalize('NFC');
  if (REGION_SLUGS.has(v)) return v;
  return REGIONS.find((r) => r.name === v)?.slug;
}

export function toSizeM2(value: unknown): number | undefined {
  const n = num(value);
  if (n === undefined || n < SIZE_RANGE.min || n > SIZE_RANGE.max) return undefined;
  return Math.round(n);
}

function budgetNumber(value: unknown): number | undefined {
  const n = num(value);
  if (n === undefined || n <= 0) return undefined;
  // "2.6" or "2600" typed in millions or thousands: only whole-shekel values are trusted.
  if (n < BUDGET_RANGE.min || n > BUDGET_RANGE.max) return undefined;
  return Math.round(n);
}

/** [min, max] whole shekels from [a, b], { min, max }, { from, to } or a single number. */
export function toBudgetRange(value: unknown): [number, number] | undefined {
  let a: unknown;
  let b: unknown;
  if (Array.isArray(value)) [a, b] = value;
  else if (isObj(value)) {
    a = pick(value, 'min', 'from', 'low', 'minNis', 'min_nis');
    b = pick(value, 'max', 'to', 'high', 'maxNis', 'max_nis');
  } else {
    a = value;
    b = value;
  }
  const lo = budgetNumber(a);
  const hi = budgetNumber(b ?? a);
  if (lo === undefined && hi === undefined) return undefined;
  const x = lo ?? hi!;
  const y = hi ?? lo!;
  return x <= y ? [x, y] : [y, x];
}

/** 'YYYY-MM' from 'YYYY-MM', a date string or a Date. */
export function toIsoMonth(value: unknown): string | undefined {
  let y: number;
  let m: number;
  if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value.trim())) {
    y = Number(value.slice(0, 4));
    m = Number(value.slice(5, 7));
  } else if (value instanceof Date && Number.isFinite(value.getTime())) {
    y = value.getUTCFullYear();
    m = value.getUTCMonth() + 1;
  } else return undefined;
  if (y < 2020 || y > 2045 || m < 1 || m > 12) return undefined;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** The last <= 10 questions, oldest first, deduped by text (latest asked wins). */
export function toQuestions(value: unknown): ProjectQuestion[] | undefined {
  const list = Array.isArray(value)
    ? value
    : isObj(value) && Array.isArray(pick(value, 'questions', 'items', 'recent'))
      ? (pick(value, 'questions', 'items', 'recent') as unknown[])
      : null;
  if (!list) return undefined;
  const byText = new Map<string, ProjectQuestion>();
  const fallbackAt = new Date().toISOString();
  for (const item of list.slice(-200)) {
    const raw = typeof item === 'string' ? item : isObj(item) ? pick(item, 'q', 'question', 'text', 'query') : undefined;
    if (typeof raw !== 'string') continue;
    const q = redactQuestion(raw);
    if (q.length < 2) continue;
    const at = (isObj(item) ? isoOrNull(pick(item, 'at', 'askedAt', 'asked_at', 'ts', 'createdAt', 'created_at')) : null) ?? fallbackAt;
    const prev = byText.get(q);
    if (!prev || prev.at <= at) byText.set(q, { q, at });
  }
  const out = Array.from(byText.values())
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(-MAX_QUESTIONS);
  return out.length ? out : undefined;
}

function primitiveInputs(value: unknown): Record<string, unknown> {
  if (!isObj(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value).slice(0, MAX_INPUT_KEYS)) {
    const key = k.slice(0, 40);
    if (typeof v === 'string') out[key] = v.slice(0, 100);
    else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export function toPlannerEstimate(value: unknown): PlannerEstimate | undefined {
  if (!isObj(value)) return undefined;
  const src = isObj(value.estimate) ? { ...value, ...value.estimate } : value;
  const total = num(pick(src, 'total', 'totalNis', 'total_ils', 'totalIls'));
  let lo = num(pick(src, 'totalMin', 'total_min', 'min', 'low', 'minNis'));
  let hi = num(pick(src, 'totalMax', 'total_max', 'max', 'high', 'maxNis'));
  if (lo === undefined && hi === undefined && total !== undefined) lo = hi = total;
  if (lo === undefined) lo = hi;
  if (hi === undefined) hi = lo;
  if (lo === undefined || hi === undefined || lo <= 0 || hi <= 0 || hi > 1_000_000_000) return undefined;
  if (lo > hi) [lo, hi] = [hi, lo];
  return {
    totalMin: Math.round(lo),
    totalMax: Math.round(hi),
    at: isoOrNull(pick(src, 'at', 'createdAt', 'created_at', 'computedAt')) ?? new Date().toISOString(),
    inputs: primitiveInputs(pick(src, 'inputs', 'input', 'params')),
  };
}

export function toSavedCount(value: unknown): number | undefined {
  const n = num(value);
  if (n === undefined || n < 0) return undefined;
  return Math.min(10_000, Math.floor(n));
}

/** Business ids from string[], { id }[] or { ids | businessIds } (uuids only, unique, <= 50). */
export function toShortlist(value: unknown): string[] | undefined {
  const list = Array.isArray(value)
    ? value
    : isObj(value)
      ? (pick(value, 'ids', 'businessIds', 'business_ids', 'items') as unknown)
      : undefined;
  if (!Array.isArray(list)) return undefined;
  const out: string[] = [];
  for (const item of list) {
    const id = typeof item === 'string' ? item : isObj(item) ? pick(item, 'id', 'businessId', 'business_id') : undefined;
    if (typeof id === 'string' && UUID_RE.test(id) && !out.includes(id.toLowerCase())) out.push(id.toLowerCase());
    if (out.length >= MAX_SHORTLIST) break;
  }
  return out.length ? out : undefined;
}

const UTM_KEY_RE = /^(utm_[a-z]+|gclid|fbclid)$/;

export function toUtm(value: unknown): Record<string, string> | undefined {
  if (!isObj(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (UTM_KEY_RE.test(k) && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
  }
  return Object.keys(out).length ? out : undefined;
}

/** A same-site path ('/x/'), never a URL or a query string. */
export function toLandingPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let v = value.trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      v = new URL(v).pathname;
    } catch {
      return undefined;
    }
  }
  v = v.split(/[?#]/)[0];
  if (!v.startsWith('/') || v.startsWith('//')) return undefined;
  try {
    v = decodeURI(v);
  } catch {
    // keep encoded
  }
  return v.slice(0, 300);
}

export function toSource(value: unknown): ProjectSource | undefined {
  if (!isObj(value)) return undefined;
  const out: ProjectSource = {};
  const utm = toUtm(value.utm);
  if (utm) out.utm = utm;
  const landing = toLandingPath(pick(value, 'landing', 'landingPath', 'landing_path'));
  if (landing) out.landing = landing;
  const touch = pick(value, 'lastTouch', 'last_touch');
  if (typeof touch === 'string' && touch.trim()) out.lastTouch = cleanText(touch, 200);
  return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------
// The whole file
// ---------------------------------------------------------------------------

/** Any value -> a valid ProjectFile (camelCase contract keys, or snake_case variants). */
export function sanitizeProjectFile(input: unknown): ProjectFile {
  const file: ProjectFile = { version: 1 };
  if (!isObj(input)) return file;
  const o = input;

  const stage = toStageId(pick(o, 'stage', 'stageId', 'stage_id', 'construction_stage'));
  if (stage) file.stage = stage;
  const region = toRegionSlug(pick(o, 'regionSlug', 'region_slug', 'region'));
  if (region) file.regionSlug = region;
  const size = toSizeM2(pick(o, 'sizeM2', 'size_m2', 'sizeSqm', 'size_sqm', 'size'));
  if (size !== undefined) file.sizeM2 = size;

  const budgetValue =
    pick(o, 'budgetRangeNis', 'budget_range_nis', 'budgetRange', 'budget_range', 'budget') ??
    (pick(o, 'budgetMin', 'budget_min', 'budgetMax', 'budget_max') !== undefined
      ? { min: pick(o, 'budgetMin', 'budget_min'), max: pick(o, 'budgetMax', 'budget_max') }
      : undefined);
  const budget = toBudgetRange(budgetValue);
  if (budget) file.budgetRangeNis = budget;

  const moveIn = toIsoMonth(pick(o, 'targetMoveIn', 'target_move_in', 'moveIn', 'move_in'));
  if (moveIn) file.targetMoveIn = moveIn;
  const questions = toQuestions(pick(o, 'questions'));
  if (questions) file.questions = questions;
  const planner = toPlannerEstimate(pick(o, 'plannerEstimate', 'planner_estimate', 'planner'));
  if (planner) file.plannerEstimate = planner;
  const saved = toSavedCount(pick(o, 'savedCount', 'saved_count', 'saved'));
  if (saved !== undefined) file.savedCount = saved;
  const shortlist = toShortlist(pick(o, 'shortlistBusinessIds', 'shortlist_business_ids', 'shortlist'));
  if (shortlist) file.shortlistBusinessIds = shortlist;
  const source = toSource(pick(o, 'source'));
  if (source) file.source = source;
  return file;
}

/** True when the file says nothing about the project (source/version only). */
export function isEmptyProjectFile(file: ProjectFile | null | undefined): boolean {
  if (!file) return true;
  return !(
    file.stage ||
    file.regionSlug ||
    file.sizeM2 ||
    file.budgetRangeNis ||
    file.targetMoveIn ||
    file.questions?.length ||
    file.plannerEstimate ||
    file.savedCount ||
    file.shortlistBusinessIds?.length
  );
}

/**
 * Merge files; later arguments win for single facts (pass the member's server
 * snapshot last: it is the source of truth). Lists are unioned: questions
 * keep the latest 10, the shortlist keeps every id once.
 */
export function mergeProjectFiles(...files: Array<ProjectFile | null | undefined>): ProjectFile {
  const out: ProjectFile = { version: 1 };
  const questions: ProjectQuestion[] = [];
  const shortlist: string[] = [];
  for (const f of files) {
    if (!f) continue;
    if (f.stage) out.stage = f.stage;
    if (f.regionSlug) out.regionSlug = f.regionSlug;
    if (f.sizeM2 !== undefined) out.sizeM2 = f.sizeM2;
    if (f.budgetRangeNis) out.budgetRangeNis = [f.budgetRangeNis[0], f.budgetRangeNis[1]];
    if (f.targetMoveIn) out.targetMoveIn = f.targetMoveIn;
    if (f.questions) questions.push(...f.questions);
    if (f.plannerEstimate && (!out.plannerEstimate || f.plannerEstimate.at >= out.plannerEstimate.at)) {
      out.plannerEstimate = { ...f.plannerEstimate, inputs: { ...f.plannerEstimate.inputs } };
    }
    if (f.savedCount !== undefined) out.savedCount = Math.max(out.savedCount ?? 0, f.savedCount);
    for (const id of f.shortlistBusinessIds ?? []) if (!shortlist.includes(id)) shortlist.push(id);
    if (f.source) {
      const utm = f.source.utm || out.source?.utm ? { ...out.source?.utm, ...f.source.utm } : undefined;
      out.source = {
        ...out.source,
        ...(utm ? { utm } : {}),
        ...(f.source.landing ? { landing: f.source.landing } : {}),
        ...(f.source.lastTouch ? { lastTouch: f.source.lastTouch } : {}),
      };
    }
  }
  const mergedQuestions = toQuestions(questions);
  if (mergedQuestions) out.questions = mergedQuestions;
  if (shortlist.length) out.shortlistBusinessIds = shortlist.slice(0, MAX_SHORTLIST);
  return out;
}

/** Compact JSON for a hidden form field (a sanitized file is always well under 8KB). */
export function serializeProjectFile(file: ProjectFile): string {
  return JSON.stringify(sanitizeProjectFile(file));
}

/** Parse a hidden-field value; anything malformed or oversized is an empty file. */
export function parseProjectFileField(raw: unknown): ProjectFile {
  if (typeof raw !== 'string' || !raw || raw.length > 16_000) return { version: 1 };
  try {
    return sanitizeProjectFile(JSON.parse(raw));
  } catch {
    return { version: 1 };
  }
}
