/**
 * Animation normalization, easing and per-instance ordering. Pure (no three.js),
 * so the timeline can compute step durations without building geometry.
 */
import type { Anim, AnimType, Ease, Exit, ExitType, Part, Vec2, Vec3 } from './types';

/** Base motion actually applied (courses/sequence resolve to drop/grow with stagger). */
export type Motion = 'drop' | 'rise' | 'pour' | 'grow' | 'fade' | 'slide' | 'morph' | 'none';

export interface NormAnim {
  motion: Motion;
  delay: number;
  duration: number;
  stagger: number;
  order: NonNullable<Anim['order']>;
  origin?: Vec2;
  from: Vec3;
  ease: Ease;
}

export interface NormExit {
  type: ExitType;
  delay: number;
  duration: number;
  to: Vec3;
}

const DURATION: Record<AnimType, number> = {
  drop: 0.95,
  rise: 0.9,
  pour: 1.8,
  grow: 0.7,
  fade: 0.8,
  slide: 1.3,
  morph: 4,
  courses: 0.35,
  sequence: 0.5,
  none: 0,
};

const hasTag = (p: Part, t: string) => p.tags?.includes(t) ?? false;

function defaultAnim(p: Part): AnimType {
  switch (p.shape.kind) {
    case 'terrain':
      return p.shape.from ? 'morph' : 'none';
    case 'plan':
    case 'drape':
    case 'lines':
      return 'fade';
    case 'model':
      return 'drop';
    default:
      return 'rise';
  }
}

export function normalizeAnim(p: Part): NormAnim {
  const a: Anim = typeof p.anim === 'string' ? { type: p.anim } : p.anim ?? { type: defaultAnim(p) };
  const type = a.type;
  let motion: Motion;
  let stagger = a.stagger ?? 0;
  let order = a.order ?? 'index';
  let from: Vec3 | undefined = a.from;
  let ease: Ease | undefined = a.ease;
  switch (type) {
    case 'courses':
      motion = 'drop';
      stagger = a.stagger ?? 0.12;
      order = a.order ?? 'courses';
      from = from ?? [0, 0.4, 0];
      ease = ease ?? 'out';
      break;
    case 'sequence':
      motion = 'grow';
      stagger = a.stagger ?? 0.06;
      ease = ease ?? 'back';
      break;
    default:
      motion = type;
  }
  if (motion === 'drop') {
    from = from ?? [0, p.shape.kind === 'model' ? 1.6 : 2.5, 0];
    ease = ease ?? 'bounce';
  }
  if (motion === 'slide') from = from ?? [0, 0, 6];
  if (motion === 'pour') ease = ease ?? 'inOut';
  if (motion === 'grow') ease = ease ?? 'back';
  return {
    motion,
    delay: a.delay ?? 0,
    duration: a.duration ?? DURATION[type],
    stagger,
    order,
    origin: a.origin,
    from: from ?? [0, 0, 0],
    ease: ease ?? 'out',
  };
}

export function normalizeExit(p: Part): NormExit {
  const formwork = hasTag(p, 'formwork');
  const fallback: ExitType = hasTag(p, 'ground') ? 'none' : formwork ? 'lift' : 'fade';
  const e: Exit = typeof p.exit === 'string' ? { type: p.exit } : p.exit ?? { type: fallback };
  const to: Vec3 =
    e.to ?? (e.type === 'lift' ? [0, 1.6, 0] : e.type === 'sink' ? [0, -1.2, 0] : e.type === 'slide' ? [0, 0, 8] : [0, 0, 0]);
  return { type: e.type, delay: e.delay ?? 0, duration: e.duration ?? (e.type === 'none' ? 0 : 0.7), to };
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function ease(kind: Ease, t: number): number {
  t = clamp01(t);
  switch (kind) {
    case 'linear':
      return t;
    case 'inOut':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'back': {
      const c1 = 1.4;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 'bounce': {
      // Falls in, one soft bounce of ~8 % of the height, settles.
      if (t < 0.7) {
        const u = t / 0.7;
        return u * u;
      }
      const u = (t - 0.7) / 0.3;
      return 1 - 0.08 * Math.sin(u * Math.PI);
    }
    default:
      return 1 - Math.pow(1 - t, 3);
  }
}

// ---------------------------------------------------------------------------
// Per-instance ordering
// ---------------------------------------------------------------------------

/** Representative point of each instance of an instanced shape (null for non-instanced). */
export function instancePoints(p: Part): Vec3[] | null {
  const s = p.shape;
  if (s.kind === 'boxes') return s.items.map((i) => i.at);
  if (s.kind === 'instances') return s.items.map((i) => i.at);
  if (s.kind === 'rods')
    return s.items.map((i) => [(i.a[0] + i.b[0]) / 2, Math.min(i.a[1], i.b[1]), (i.a[2] + i.b[2]) / 2] as Vec3);
  return null;
}

/**
 * Stagger slot of each instance (delay_i = delay + slot_i × stagger). 'courses' rows
 * are bottom-up with a sweep inside each row; other orders sort by a key.
 */
export function instanceSlots(points: Vec3[], a: NormAnim): Float32Array {
  const n = points.length;
  const slots = new Float32Array(n);
  if (!n || a.stagger <= 0) return slots;
  if (a.order === 'courses') {
    const ys = points.map((p) => p[1]);
    const minY = Math.min(...ys);
    // Course height: smallest positive gap between distinct levels (fallback 0.2 m).
    const levels = Array.from(new Set(ys.map((y) => Math.round((y - minY) * 100)))).sort((x, y) => x - y);
    let h = Infinity;
    for (let i = 1; i < levels.length; i++) h = Math.min(h, (levels[i] - levels[i - 1]) / 100);
    if (!isFinite(h) || h < 0.05) h = 0.2;
    const course = points.map((p) => Math.round((p[1] - minY) / h));
    const byCourse = new Map<number, number[]>();
    course.forEach((c, i) => {
      const l = byCourse.get(c);
      if (l) l.push(i);
      else byCourse.set(c, [i]);
    });
    const courses = Array.from(byCourse.keys()).sort((x, y) => x - y);
    courses.forEach((c, ci) => {
      const ids = byCourse.get(c) as number[];
      ids.sort((i, j) => points[i][0] + points[i][2] - (points[j][0] + points[j][2]));
      ids.forEach((id, k) => {
        slots[id] = ci + (ids.length > 1 ? (0.7 * k) / (ids.length - 1) : 0);
      });
    });
    return slots;
  }
  const key = (p: Vec3, i: number): number => {
    switch (a.order) {
      case 'x':
        return p[0];
      case '-x':
        return -p[0];
      case 'z':
        return p[2];
      case '-z':
        return -p[2];
      case 'y':
        return p[1];
      case 'near': {
        const o = a.origin ?? [0, 0];
        return Math.hypot(p[0] - o[0], p[2] - o[1]);
      }
      default:
        return i;
    }
  };
  const idx = points.map((_, i) => i).sort((i, j) => key(points[i], i) - key(points[j], j));
  idx.forEach((id, rank) => {
    slots[id] = rank;
  });
  return slots;
}

/** Seconds from step start until this part's entry animation is complete. */
export function partSpan(p: Part): number {
  const a = normalizeAnim(p);
  const pts = instancePoints(p);
  let maxSlot = 0;
  if (pts && a.stagger > 0) {
    const s = instanceSlots(pts, a);
    for (let i = 0; i < s.length; i++) maxSlot = Math.max(maxSlot, s[i]);
  }
  return a.delay + a.duration + maxSlot * a.stagger;
}
