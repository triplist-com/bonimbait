/**
 * The owner's 7 build stages, in order: רכישה · תכנון · היתר/מכרז · שלד ·
 * תשתיות · גמרים · אכלוס. One config for the homepage journey navigator, the
 * Builder Hub roadmap (Wave B, hub squad) and anything else that walks a
 * family through the build.
 *
 * Each stage maps to the post category that holds its articles
 * (post_categories.slug) and, where one exists, to the member profile stage
 * (profiles.construction_stage). Icons are the owner's two-tone stage icons
 * from bonimbayit.co.il (public/brand/stages). Client-safe.
 */
import type { ConstructionStage } from '@/lib/db/types';

export interface BuildStage {
  /** Stable id (URL- and storage-safe). */
  id: 'purchase' | 'planning' | 'permit' | 'frame' | 'infrastructure' | 'finishing' | 'moving-in';
  /** 1-based position in the journey. */
  order: number;
  /** Short label, as the owner says it. */
  label: string;
  /** Full title for headings. */
  title: string;
  /** One practical line about what happens in this stage. */
  summary: string;
  /** Post category slug (decoded) that holds this stage's articles. */
  categorySlug: string;
  /** Matching member profile stage, when the profile enum has one. */
  profileStage: ConstructionStage | null;
  /** Owner's stage icon. */
  icon: string;
}

export const BUILD_STAGES: readonly BuildStage[] = [
  {
    id: 'purchase',
    order: 1,
    label: 'רכישה',
    title: 'רכישת מגרש או נכס',
    summary: 'בדיקות לפני שקונים: תב״ע, זכויות בנייה, מיסים ומימון',
    categorySlug: 'שלב-רכישה',
    profileStage: 'land',
    icon: '/brand/stages/land.svg',
  },
  {
    id: 'planning',
    order: 2,
    label: 'תכנון',
    title: 'תכנון הבית',
    summary: 'אדריכל, תוכניות ותקציב שמתאימים אחד לשני',
    categorySlug: 'שלב-תכנון',
    profileStage: 'planning',
    icon: '/brand/stages/planning.svg',
  },
  {
    id: 'permit',
    order: 3,
    label: 'היתר/מכרז',
    title: 'היתר בנייה ומכרז קבלנים',
    summary: 'רישוי, כתב כמויות והשוואת הצעות מחיר',
    categorySlug: 'שלב-היתר',
    profileStage: 'tender',
    icon: '/brand/stages/permit.svg',
  },
  {
    id: 'frame',
    order: 4,
    label: 'שלד',
    title: 'עבודות שלד',
    summary: 'יסודות, ברזל ובטון: מה בודקים לפני כל יציקה',
    categorySlug: 'שלב-שלד',
    profileStage: 'frame',
    icon: '/brand/stages/frame.svg',
  },
  {
    id: 'infrastructure',
    order: 5,
    label: 'תשתיות',
    title: 'עבודות תשתית',
    summary: 'חשמל, אינסטלציה, מיזוג ואיטום לפני שסוגרים קירות',
    categorySlug: 'שלב-תשתיות',
    profileStage: null,
    icon: '/brand/stages/infrastructure.svg',
  },
  {
    id: 'finishing',
    order: 6,
    label: 'גמרים',
    title: 'עבודות גמר',
    summary: 'ריצוף, טיח, אלומיניום ונגרות: איכות ומחירים',
    categorySlug: 'שלב-גמרים',
    profileStage: 'finishing',
    icon: '/brand/stages/finishing.svg',
  },
  {
    id: 'moving-in',
    order: 7,
    label: 'אכלוס',
    title: 'אכלוס הבית',
    summary: 'מסירה, בדק בית וטופס 4: עד שנכנסים הביתה',
    categorySlug: 'כניסה-לבית',
    profileStage: 'moving_in',
    icon: '/brand/stages/moving-in.svg',
  },
] as const;

/** Category archive URL for a stage (trailing slash, decoded Hebrew slug). */
export function stageHref(stage: Pick<BuildStage, 'categorySlug'>): string {
  return `/category/${stage.categorySlug}/`;
}

export function getStage(id: BuildStage['id']): BuildStage | undefined {
  return BUILD_STAGES.find((s) => s.id === id);
}

/** Stage for a post category slug (decoded or percent-encoded). */
export function stageForCategory(slug: string): BuildStage | undefined {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // keep raw
  }
  const norm = decoded.normalize('NFC');
  return BUILD_STAGES.find((s) => s.categorySlug.normalize('NFC') === norm);
}

/** Stage for a member profile stage value, if one maps to it. */
export function stageForProfile(value: ConstructionStage | null | undefined): BuildStage | undefined {
  if (!value) return undefined;
  return BUILD_STAGES.find((s) => s.profileStage === value);
}
