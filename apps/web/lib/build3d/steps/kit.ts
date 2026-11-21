/**
 * Small helpers for step authors: text merge with the Content agent's copy, prices,
 * bill-of-materials lines, rebar weights and part builders.
 */
import { METHOD_CONTENT, PRICES, STEP_CONTENT } from '../content';
import { DEFAULT_METHOD, type MethodId } from '../methods';
import type { MaterialLine, Part, Step, StepDef, Vec2, Vec3 } from '../engine/types';

export { PRICES };
export type PriceKey = keyof typeof PRICES;

/** Rates the content table does not (yet) have — rough 2026 ILS, ex-VAT. */
export const EXTRA_RATES = {
  /** Architect + engineers + consultants for a ~280 m² private house. */
  designLump: 85000,
  /** Scrub clearing + removal, per m² of lot. */
  clearingM2: 12,
  /** Machine compaction of the excavation bottom, per m². */
  compactionM2: 22,
  /** Graded gravel (מצע) supplied and spread, per m³. */
  gravelM3: 140,
} as const;

/** Merges text from lib/build3d/content (wins) over the author's fallback text. */
/**
 * Merge a step's text by id. A method may re-word a shared step (e.g. ICF's interior plaster)
 * via METHOD_CONTENT[method][id], which wins over the shared STEP_CONTENT[id].
 */
export function withText(def: StepDef, method: MethodId = DEFAULT_METHOD): Step {
  const c = METHOD_CONTENT[method]?.[def.id] ?? STEP_CONTENT[def.id];
  return {
    ...def,
    titleHe: c?.titleHe ?? def.titleHe ?? def.id,
    descHe: c?.descHe ?? def.descHe ?? '',
    crewHe: c?.crewHe ?? def.crewHe ?? '',
    durationDays: c?.durationDays ?? def.durationDays ?? 1,
    tipHe: c?.tipHe ?? def.tipHe ?? '',
    searchQuery: c?.searchQuery ?? def.searchQuery ?? def.titleHe ?? '',
    videos: c?.videos ?? def.videos,
    checkpointHe: c?.checkpointHe ?? def.checkpointHe,
  };
}

const roundTo = (v: number, digits: number) => {
  const k = Math.pow(10, digits);
  return Math.round(v * k) / k;
};

/** Bill-of-materials line, rounded for display. */
export const line = (nameHe: string, qty: number, unitHe: string, digits = 1): MaterialLine => ({
  nameHe,
  qty: roundTo(qty, digits),
  unitHe,
});

/** Rebar weight (kg) for a bar of diameter d (mm) and length L (m): 0.00617·d²·L. */
export const rebarKg = (dMm: number, lengthM: number) => 0.00617 * dMm * dMm * lengthM;

/** Round a cost to a "quote-like" number (nearest 100 / 1,000). */
export const roundCost = (ils: number) => (ils >= 20000 ? Math.round(ils / 1000) * 1000 : Math.round(ils / 100) * 100);

// ---------------------------------------------------------------------------
// Point helpers
// ---------------------------------------------------------------------------

export const v3 = (p: Vec2, y: number): Vec3 => [p[0], y, p[1]];

/** Points of a helix (spirals of pile cages). */
export function helix(radius: number, pitch: number, y0: number, y1: number, perTurn = 14): Vec3[] {
  const turns = Math.max(1, (y1 - y0) / pitch);
  const n = Math.ceil(turns * perTurn);
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    out.push([Math.cos(a) * radius, y0 + (y1 - y0) * t, Math.sin(a) * radius]);
  }
  return out;
}

/** Part shorthand for a named model standing at p (ground y), facing direction rotY. */
export function model(
  id: string,
  name: Extract<Part['shape'], { kind: 'model' }>['name'],
  at: Vec3,
  rotY = 0,
  extra: Partial<Part> = {},
): Part {
  return {
    id,
    shape: { kind: 'model', name },
    material: 'white',
    position: at,
    rotationY: rotY,
    tags: ['model', ...(extra.tags ?? [])],
    ...extra,
  } as Part;
}
