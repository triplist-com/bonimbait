import type { ConstructionStage } from '@/lib/db/types';

/**
 * Community lookup values used by signup/profile/lead forms.
 *
 * REGIONS mirrors the master list seeded in
 * supabase/migrations/20260928120000_*.sql (the live directory list). Forms
 * send the slug; the DB (public.resolve_region) also accepts every live label
 * variant via regions.aliases. `nationwide` ("כל הארץ") is for professionals'
 * work regions only, so member-facing forms use MEMBER_REGIONS.
 */

export const CONSTRUCTION_STAGES: ReadonlyArray<{ value: ConstructionStage; label: string }> = [
  { value: 'land', label: 'רכישת מגרש' },
  { value: 'planning', label: 'תכנון' },
  { value: 'tender', label: 'מכרז קבלנים' },
  { value: 'frame', label: 'שלד' },
  { value: 'finishing', label: 'גמרים' },
  { value: 'design', label: 'עיצוב' },
  { value: 'moving_in', label: 'כניסה לבית' },
  { value: 'renovation', label: 'שיפוץ' },
];

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
