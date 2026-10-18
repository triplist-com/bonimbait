/**
 * Where the planner's answers come from before the visitor touches anything:
 *   1. the URL (a shared result, a scenario page's "התאימו לבית שלכם"),
 *   2. bb.hub.draft (the hub onboarding, docs/platform/PROGRAM.md §6),
 *   3. a free-text question (the cost CTA under an AI answer).
 * Pure and client-safe.
 */
import { BUILD_STAGES } from '@/lib/stages';
import { clampSize, isExtraId, isFinishLevel, isPlannerRegion } from './engine';
import type { ExtraId, Floors, HubDraft, PlannerInput, StageId } from './types';
import { EXTRA_IDS } from './types';

/** URL parameter names: /calculator/?m2=200&floors=2&region=sharon&finish=standard&extras=basement,pool */
export const QUERY_KEYS = { size: 'm2', floors: 'floors', region: 'region', finish: 'finish', extras: 'extras' } as const;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function param(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const v = source[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Answers -> query string (no leading "?"), in a fixed order. */
export function plannerQuery(input: PlannerInput): string {
  const p = new URLSearchParams();
  p.set(QUERY_KEYS.size, String(input.sizeM2));
  p.set(QUERY_KEYS.floors, String(input.floors));
  p.set(QUERY_KEYS.region, input.regionSlug);
  p.set(QUERY_KEYS.finish, input.finishLevel);
  if (input.extras.length) p.set(QUERY_KEYS.extras, input.extras.join(','));
  return p.toString();
}

/** Query -> the answers it carries (unknown values are dropped). */
export function parsePlannerQuery(source: ParamSource): Partial<PlannerInput> {
  const out: Partial<PlannerInput> = {};
  const size = clampSize(param(source, QUERY_KEYS.size));
  if (size) out.sizeM2 = size;
  const floors = Number(param(source, QUERY_KEYS.floors));
  if (floors === 1 || floors === 2 || floors === 3) out.floors = floors;
  const region = param(source, QUERY_KEYS.region);
  if (isPlannerRegion(region)) out.regionSlug = region;
  const finish = param(source, QUERY_KEYS.finish);
  if (isFinishLevel(finish)) out.finishLevel = finish;
  const extras = param(source, QUERY_KEYS.extras);
  if (extras !== undefined) out.extras = EXTRA_IDS.filter((id) => extras.split(',').includes(id));
  return out;
}

/** A URL with every required answer opens straight on the result. */
export function isCompleteInput(input: Partial<PlannerInput>): input is PlannerInput {
  return Boolean(input.sizeM2 && input.floors && input.regionSlug && input.finishLevel);
}

const STAGE_IDS = new Set<string>(BUILD_STAGES.map((s) => s.id));

/** bb.hub.draft (raw JSON) -> the fields the planner uses, validated. Null when absent or unusable. */
export function parseHubDraft(raw: string | null | undefined): HubDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  // Tolerate a wrapper ({ draft: {...} } or { version, data }) around the §6 fields.
  const obj = value as Record<string, unknown>;
  const src = (obj.draft && typeof obj.draft === 'object' ? obj.draft : obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const draft: HubDraft = {};
  if (typeof src.stage === 'string' && STAGE_IDS.has(src.stage)) draft.stage = src.stage as StageId;
  if (isPlannerRegion(src.regionSlug)) draft.regionSlug = src.regionSlug;
  const size = clampSize(src.sizeM2);
  if (size) draft.sizeM2 = size;
  const budget = src.budgetRangeNis;
  if (Array.isArray(budget) && budget.length === 2 && budget.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
    const [a, b] = budget as [number, number];
    draft.budgetRangeNis = a <= b ? [a, b] : [b, a];
  }
  if (typeof src.targetMoveIn === 'string' && /^\d{4}-\d{2}/.test(src.targetMoveIn)) draft.targetMoveIn = src.targetMoveIn.slice(0, 7);
  return Object.keys(draft).length ? draft : null;
}

/** The planner answers a hub draft implies (size and region; the rest is asked). */
export function inputFromHubDraft(draft: HubDraft | null): Partial<PlannerInput> {
  if (!draft) return {};
  const out: Partial<PlannerInput> = {};
  if (draft.sizeM2) out.sizeM2 = draft.sizeM2;
  if (draft.regionSlug) out.regionSlug = draft.regionSlug;
  return out;
}

// --- Free text ("כמה עולה בית של 220 מ״ר בשרון עם מרתף?") --------------------

const REGION_WORDS: Array<[string, RegExp]> = [
  ['golan', /גולן/],
  ['upper-galilee', /גליל עליון|קרי(?:י)?ת שמונה|צפת|ראש פינה/],
  ['akko-nahariya', /עכו|נהרי(?:י)?ה/],
  ['lower-galilee', /גליל תחתון|טבריה|עפולה|נצרת/],
  ['haifa-krayot', /חיפה|קריות|קרית (?:ביאליק|מוצקין|אתא|ים)/],
  ['zichron-valleys', /זכרון|העמקים|יקנעם|טבעון|עמק יזרעאל/],
  ['hadera', /חדרה|פרדס חנה|כרכור/],
  ['sharon', /שרון|רעננה|כפר סבא|נתניה|הרצליה|אבן יהודה|כפר יונה/],
  // "מרכז" but not "מרכזי" (as in "מיני מרכזי", an AC type).
  ['center', /מרכז(?![א-ת])|תל אביב|גוש דן|פתח תקו(?:ו)?ה|ראשון לציון|רמת גן/],
  ['shfela', /שפלה|רחובות|מודיעין|נס ציונה|גדרה|יבנה|גן יבנה/],
  ['jerusalem', /ירושלים|בית שמש|מבשרת/],
  ['judea-samaria', /שומרון|יהודה ושומרון|בקעת הירדן|אריאל|גוש עציון/],
  ['south', /דרום|באר שבע|נגב|אשקלון|אשדוד|קרי(?:י)?ת גת|נתיבות|אופקים|שדרות|ערד/],
];

const EXTRA_WORDS: Array<[ExtraId, RegExp]> = [
  ['basement', /מרתף|מרטף/],
  ['pool', /בריכה|בריכת/],
  ['slope', /שיפוע|טופוגרפי|חומות|קיר תמך|קירות תמך/],
  ['vrf', /\bVRF\b|וי ?אר ?אף|מיזוג נסתר|מזגנים נסתרים/i],
  ['smart_home', /בית חכם|מתח נמוך/],
];

/** Best-effort answers from a Hebrew question. Only what's clearly said. */
export function inputFromText(text: string | null | undefined): Partial<PlannerInput> {
  if (!text) return {};
  const q = text.replace(/[״"]/g, '"');
  const out: Partial<PlannerInput> = {};
  // (JS \b is ASCII-only, so Hebrew units are matched without it.)
  const size = /(\d{2,4})\s*(?:מ"ר|מטר(?:ים)?|מ'|sqm|m2)/i.exec(q);
  const m2 = size ? clampSize(size[1]) : undefined;
  if (m2) out.sizeM2 = m2;
  let floors: Floors | undefined;
  if (/קומה אחת|חד[- ]?קומתי|חד[- ]?מפלסי/.test(q)) floors = 1;
  else if (/(?:שתי|2)\s*קומות|דו[- ]?קומתי/.test(q)) floors = 2;
  else if (/(?:שלוש|3|ארבע|4)\s*קומות|תלת[- ]?קומתי/.test(q)) floors = 3;
  if (floors) out.floors = floors;
  const region = REGION_WORDS.find(([, re]) => re.test(q));
  if (region) out.regionSlug = region[0];
  if (/יוקר|לוקסוס/.test(q)) out.finishLevel = 'luxury';
  else if (/גמר גבוה|רמה גבוהה|רמת גמר גבוהה/.test(q)) out.finishLevel = 'high';
  else if (/בסיסי|חסכוני|פשוט|בתקציב נמוך|בזול/.test(q)) out.finishLevel = 'basic';
  const extras = EXTRA_WORDS.filter(([, re]) => re.test(q)).map(([id]) => id);
  if (extras.length) out.extras = extras;
  return out;
}

/** Later sources win: merge(hub, url) lets a shared link override the hub draft. */
export function mergeInputs(...parts: Array<Partial<PlannerInput>>): Partial<PlannerInput> {
  const out: Partial<PlannerInput> = {};
  for (const part of parts) {
    for (const [k, v] of Object.entries(part) as Array<[keyof PlannerInput, PlannerInput[keyof PlannerInput]]>) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
  }
  if (out.extras) out.extras = out.extras.filter(isExtraId);
  return out;
}
