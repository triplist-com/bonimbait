import type { ConstructionStage } from '@/lib/db/types';
import { BUILD_STAGES } from '@/lib/stages';

/**
 * Community lookup values used by signup/profile/lead forms.
 *
 * REGIONS mirrors the master list seeded in
 * supabase/migrations/20260928120000_*.sql (the live directory list). Forms
 * send the slug; the DB (public.resolve_region) also accepts every live label
 * variant via regions.aliases. `nationwide` ("כל הארץ") is for professionals'
 * work regions only, so member-facing forms use MEMBER_REGIONS.
 */

/**
 * The member profile stages (profiles.construction_stage), named with the
 * owner's 7 stages from lib/stages.ts (one vocabulary on every screen:
 * רכישה · תכנון · היתר/מכרז · שלד · גמרים · אכלוס; תשתיות has no profile
 * value), in journey order, then the two profile-only values.
 */
export const CONSTRUCTION_STAGES: ReadonlyArray<{ value: ConstructionStage; label: string }> = [
  ...BUILD_STAGES.flatMap((s) => (s.profileStage ? [{ value: s.profileStage, label: s.label }] : [])),
  { value: 'design', label: 'עיצוב' },
  { value: 'renovation', label: 'שיפוץ' },
];

/** The Hebrew name of a profile stage value, or null (unknown values show nothing). */
export function constructionStageLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CONSTRUCTION_STAGES.find((s) => s.value === value)?.label ?? null;
}

export type RegionOption = { slug: string; name: string; isNationwide?: boolean };

export const REGIONS: ReadonlyArray<RegionOption> = [
  { slug: 'golan', name: 'רמת הגולן' },
  { slug: 'upper-galilee', name: 'גליל עליון' },
  { slug: 'akko-nahariya', name: 'עכו - נהריה והסביבה' },
  { slug: 'lower-galilee', name: 'גליל תחתון' },
  { slug: 'haifa-krayot', name: 'חיפה, קריות והסביבה' },
  { slug: 'zichron-valleys', name: 'זכרון והעמקים' },
  { slug: 'hadera', name: 'חדרה והסביבה' },
  { slug: 'sharon', name: 'אזור השרון' },
  { slug: 'center', name: 'מרכז' },
  { slug: 'shfela', name: 'שפלה' },
  { slug: 'jerusalem', name: 'אזור ירושלים' },
  { slug: 'judea-samaria', name: 'יהודה, שומרון ובקעת הירדן' },
  { slug: 'south', name: 'אזור דרום' },
  { slug: 'nationwide', name: 'כל הארץ', isNationwide: true },
];

/** The 13 regions offered to members (live signup list). */
export const MEMBER_REGIONS: ReadonlyArray<RegionOption> = REGIONS.filter((r) => !r.isNationwide);

export function isConstructionStage(value: unknown): value is ConstructionStage {
  return CONSTRUCTION_STAGES.some((s) => s.value === value);
}

export function isRegionSlug(value: unknown): value is string {
  return REGIONS.some((r) => r.slug === value);
}
