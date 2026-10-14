/**
 * Seeded demo-data generator: Hebrew people, towns in the 14 regions,
 * construction stages, business names, leads, builder questions and daily
 * time series with weekly seasonality and growth.
 *
 *   const gen = createDemoGenerator('hub-demo', { today: demoToday() });
 *   gen.person(); gen.leads(8); gen.timeSeries({ days: 56, base: 400, weeklyGrowth: 0.03 });
 *
 * Deterministic: the same seed and `today` give the same data. Each call kind
 * draws from its own stream keyed by (kind, ordinal), so the 3rd person is the
 * same whatever else a fixture generates. Plain JSON-safe values only (ISO
 * strings, numbers), so fixtures can go straight into Client Components.
 */
import { CONSTRUCTION_STAGES, REGIONS } from '@/lib/constants/community';
import type { ConstructionStage, LeadType } from '@/lib/db/types';
import {
  BUDGET_BANDS,
  CITIES_BY_REGION,
  DEMO_QUESTIONS,
  DEMO_SPECIALTIES,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  ISRAELI_WEEK,
  LAST_NAMES,
  LEAD_SOURCES,
  REGION_AREA,
  REGION_WEIGHTS,
} from './data';
import { createRandom, type DemoRandom } from './random';

export type DemoPerson = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: 'f' | 'm';
  initials: string;
  /** Masked on purpose: '052-•••-4821'. Render with dir="ltr". */
  phone: string;
  email: string;
};

export type DemoPlace = { city: string; regionSlug: string; regionName: string };
export type DemoStage = { value: ConstructionStage; label: string };
export type DemoSpecialty = { slug: string; name: string };

export type DemoBusiness = {
  id: string;
  slug: string;
  name: string;
  specialty: DemoSpecialty;
  place: DemoPlace;
  /** 0-100, the live "overall %" scale. */
  ratingPercent: number;
  reviewCount: number;
  servesNationwide: boolean;
};

export type DemoLeadStatus = 'new' | 'contacted' | 'won' | 'lost';

export type DemoLead = {
  id: string;
  /** Looks like a real lead ref (BB-YY-NNNNNN). */
  ref: string;
  /** Relative, so the demo always looks fresh: render "לפני 12 דקות". */
  minutesAgo: number;
  type: LeadType;
  person: DemoPerson;
  place: DemoPlace;
  stage: DemoStage;
  sizeSqm: number;
  budgetBand: string;
  question: string | null;
  specialty: DemoSpecialty | null;
  source: { key: string; label: string };
  status: DemoLeadStatus;
  /** 0-100 lead quality. */
  score: number;
};

export type DemoQuestion = {
  text: string;
  topic: string;
  specialty: string | null;
  /** How many builders asked it in the period. */
  asks: number;
  /** 0-1 answer confidence; low = a content gap (the next video to shoot). */
  confidence: number;
  answered: boolean;
};

export type DemoPoint = { date: string; value: number };

export type TimeSeriesOptions = {
  /** Number of days, ending on `end` (inclusive). */
  days: number;
  /** Level at the start of the series. */
  base: number;
  /** Compound growth per week, e.g. 0.03 = +3%/week. */
  weeklyGrowth?: number;
  /** Weekday multipliers, Sunday first. Default: ISRAELI_WEEK. */
  weekly?: readonly number[];
  /** Relative day-to-day noise (sd), e.g. 0.1. */
  noise?: number;
  /** Last date, YYYY-MM-DD. Default: the generator's `today`. */
  end?: string;
  /** Round to whole numbers (default true). */
  integer?: boolean;
  min?: number;
};

// ---------------------------------------------------------------------------
// Dates (calendar dates as YYYY-MM-DD; arithmetic in UTC, no DST surprises)
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Israel. */
export function demoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

export function addDays(date: string, days: number): string {
  if (!DATE_RE.test(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const MEMBER_REGIONS = REGIONS.filter((r) => !r.isNationwide);
const REGION_NAME = new Map(REGIONS.map((r) => [r.slug, r.name]));

const LEAD_TYPE_WEIGHTS: ReadonlyArray<readonly [LeadType, number]> = [
  ['business_contact', 34],
  ['consultation', 28],
  ['whatsapp_join', 14],
  ['service_plan', 10],
  ['benefit', 8],
  ['partner', 6],
];

const STAGE_WEIGHTS: ReadonlyArray<readonly [ConstructionStage, number]> = [
  ['land', 14], ['planning', 26], ['tender', 16], ['frame', 16],
  ['finishing', 14], ['design', 6], ['moving_in', 3], ['renovation', 5],
];

export interface DemoGenerator {
  readonly seed: string;
  /** YYYY-MM-DD the data is anchored to (time series end here). */
  readonly today: string;
  /** The root stream, for one-off draws (prefer fork() for sections). */
  readonly rng: DemoRandom;
  /** An independent generator for one part of a fixture. */
  fork(label: string): DemoGenerator;
  person(): DemoPerson;
  /** A town and its region (weighted like the community, or in `regionSlug`). */
  place(regionSlug?: string): DemoPlace;
  /** One of the 13 member regions. */
  region(): { slug: string; name: string };
  regions(): ReadonlyArray<{ slug: string; name: string }>;
  stage(): DemoStage;
  business(specialtySlug?: string): DemoBusiness;
  businesses(n: number, specialtySlug?: string): DemoBusiness[];
  lead(opts?: { withinMinutes?: number; type?: LeadType }): DemoLead;
  /** n leads, newest first. */
  leads(n: number, opts?: { withinMinutes?: number }): DemoLead[];
  /** n distinct builder questions, most asked first. */
  questions(n: number, opts?: { topAsks?: number }): DemoQuestion[];
  /** A daily series with weekly seasonality, compound growth and noise. */
  timeSeries(o: TimeSeriesOptions): DemoPoint[];
}

export function createDemoGenerator(seed: string, opts: { today?: string } = {}): DemoGenerator {
  const today = opts.today ?? demoToday();
  if (!DATE_RE.test(today)) throw new Error(`today must be YYYY-MM-DD, got ${today}`);
  const root = createRandom(seed);
  const counters = new Map<string, number>();

  /** A fresh stream for the next call of `kind`. */
  function stream(kind: string): DemoRandom {
    const n = counters.get(kind) ?? 0;
    counters.set(kind, n + 1);
    return root.fork(`${kind}:${n}`);
  }

  function makePerson(r: DemoRandom): DemoPerson {
    const gender: 'f' | 'm' = r.bool() ? 'f' : 'm';
    const firstName = r.pick(gender === 'f' ? FIRST_NAMES_F : FIRST_NAMES_M);
    const lastName = r.pick(LAST_NAMES);
    return {
      id: r.uuid(),
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      gender,
      initials: `${firstName[0]}.${lastName[0]}.`,
      phone: `05${r.pick(['0', '2', '3', '4', '5', '8'])}-•••-${String(r.int(0, 9999)).padStart(4, '0')}`,
      email: `builder${r.int(1000, 9999)}@example.com`,
    };
  }

  function makePlace(r: DemoRandom, regionSlug?: string): DemoPlace {
    const slug = regionSlug && CITIES_BY_REGION[regionSlug] ? regionSlug : r.weighted(REGION_WEIGHTS);
    return { city: r.pick(CITIES_BY_REGION[slug]), regionSlug: slug, regionName: REGION_NAME.get(slug) ?? slug };
  }

  function makeStage(r: DemoRandom): DemoStage {
    const value = r.weighted(STAGE_WEIGHTS);
    return { value, label: CONSTRUCTION_STAGES.find((s) => s.value === value)!.label };
  }

  function makeSpecialty(r: DemoRandom, slug?: string): DemoSpecialty {
    const found = slug ? DEMO_SPECIALTIES.find((s) => s.slug === slug) : undefined;
    const s = found ?? r.pick(DEMO_SPECIALTIES);
    return { slug: s.slug, name: s.name };
  }

  function makeBusinessName(r: DemoRandom, specialtySlug: string, place: DemoPlace): string {
    const spec = DEMO_SPECIALTIES.find((s) => s.slug === specialtySlug) ?? DEMO_SPECIALTIES[0];
    const last = r.pick(LAST_NAMES);
    const first = r.pick(r.bool() ? FIRST_NAMES_F : FIRST_NAMES_M);
    if (spec.slug === 'architects') {
      return r.pick([`סטודיו ${first} ${last}`, `${last} אדריכלים`, `${first} ${last} אדריכלות ועיצוב`]);
    }
    if (spec.slug === 'mortgage') return r.pick([`${last} ייעוץ משכנתאות`, `משכנתא חכמה – ${first} ${last}`]);
    return r.pick([
      `${last} ${spec.noun}`,
      `${first[0]}.${last[0]}. ${spec.noun} בע״מ`,
      `${spec.noun} ${REGION_AREA[place.regionSlug] ?? 'המרכז'}`,
      `${last} ובניו – ${spec.noun}`,
    ]);
  }

  const gen: DemoGenerator = {
    seed,
    today,
    rng: root,

    fork(label: string): DemoGenerator {
      return createDemoGenerator(`${seed}/${label}`, { today });
    },

    person(): DemoPerson {
      return makePerson(stream('person'));
    },

    place(regionSlug?: string): DemoPlace {
      return makePlace(stream('place'), regionSlug);
    },

    region(): { slug: string; name: string } {
      const r = stream('region');
      const slug = r.weighted(REGION_WEIGHTS);
      return { slug, name: REGION_NAME.get(slug) ?? slug };
    },

    regions(): ReadonlyArray<{ slug: string; name: string }> {
      return MEMBER_REGIONS.map((r) => ({ slug: r.slug, name: r.name }));
    },

    stage(): DemoStage {
      return makeStage(stream('stage'));
    },

    business(specialtySlug?: string): DemoBusiness {
      const r = stream('business');
      const specialty = makeSpecialty(r, specialtySlug);
      const place = makePlace(r);
      const name = makeBusinessName(r, specialty.slug, place);
      return {
        id: r.uuid(),
        slug: `demo-${r.int(100, 999)}-${specialty.slug}`,
        name,
        specialty,
        place,
        ratingPercent: r.int(84, 99),
        reviewCount: r.int(3, 64),
        servesNationwide: r.bool(0.2),
      };
    },

    businesses(n: number, specialtySlug?: string): DemoBusiness[] {
      return Array.from({ length: n }, () => gen.business(specialtySlug));
    },

    lead(opts: { withinMinutes?: number; type?: LeadType } = {}): DemoLead {
      const r = stream('lead');
      const minutesAgo = r.int(2, Math.max(3, opts.withinMinutes ?? 3 * 24 * 60));
      const type = opts.type ?? r.weighted(LEAD_TYPE_WEIGHTS);
      const stage = makeStage(r);
      const q = r.bool(0.65) ? r.pick(DEMO_QUESTIONS) : null;
      const budgetIdx = r.weighted(BUDGET_BANDS.map((_, i) => [i, [3, 5, 4, 3, 1][i]] as const));
      const status: DemoLeadStatus =
        minutesAgo < 6 * 60 ? (r.bool(0.8) ? 'new' : 'contacted') : r.weighted([['contacted', 5], ['won', 2], ['lost', 2], ['new', 1]]);
      const stageBoost = ['planning', 'tender', 'frame'].includes(stage.value) ? 14 : 0;
      return {
        id: r.uuid(),
        ref: `BB-${today.slice(2, 4)}-${String(r.int(1200, 1900)).padStart(6, '0')}`,
        minutesAgo,
        type,
        person: makePerson(r),
        place: makePlace(r),
        stage,
        sizeSqm: 10 * r.int(14, 30),
        budgetBand: BUDGET_BANDS[budgetIdx],
        question: q?.text ?? null,
        specialty: q?.specialty ? makeSpecialty(r, q.specialty) : type === 'business_contact' ? makeSpecialty(r) : null,
        source: (({ key, label }) => ({ key, label }))(r.weighted(LEAD_SOURCES.map((s) => [s, s.weight] as const))),
        status,
        score: Math.min(98, Math.max(35, Math.round(r.normal(62 + stageBoost + budgetIdx * 3, 9)))),
      };
    },

    leads(n: number, opts: { withinMinutes?: number } = {}): DemoLead[] {
      return Array.from({ length: n }, () => gen.lead(opts)).sort((a, b) => a.minutesAgo - b.minutesAgo);
    },

    questions(n: number, opts: { topAsks?: number } = {}): DemoQuestion[] {
      const r = stream('questions');
      const top = opts.topAsks ?? 240;
      return r.sample(DEMO_QUESTIONS, n).map((q, i) => {
        const confidence = Math.round(r.float(0.32, 0.96) * 100) / 100;
        return {
          text: q.text,
          topic: q.topic,
          specialty: q.specialty ?? null,
          asks: Math.max(3, Math.round((top / Math.pow(i + 1, 0.75)) * r.float(0.9, 1.1))),
          confidence,
          answered: confidence >= 0.5,
        };
      });
    },

    timeSeries(o: TimeSeriesOptions): DemoPoint[] {
      const r = stream('series');
      const end = o.end ?? today;
      const weekly = o.weekly ?? ISRAELI_WEEK;
      const noise = o.noise ?? 0.1;
      const growth = o.weeklyGrowth ?? 0;
      const integer = o.integer ?? true;
      return Array.from({ length: Math.max(0, o.days) }, (_, i) => {
        const date = addDays(end, i - (o.days - 1));
        const trend = o.base * Math.pow(1 + growth, i / 7);
        const value = trend * weekly[weekdayOf(date)] * Math.max(0.2, 1 + r.normal(0, noise));
        const v = Math.max(o.min ?? 0, value);
        return { date, value: integer ? Math.round(v) : Math.round(v * 100) / 100 };
      });
    },
  };
  return gen;
}

/** Sum a series, optionally the last `days` only. */
export function seriesTotal(points: readonly DemoPoint[], days?: number): number {
  const slice = days ? points.slice(-days) : points;
  return slice.reduce((sum, p) => sum + p.value, 0);
}
