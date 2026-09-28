import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/site';
import type { SpecialPageRegistry } from './types';

/**
 * Yoast title/description from the crawl (data/migration/pages.json + raw
 * HTML). Robots: the live thank-you pages are `index, follow` (checked
 * 2026-09-28), so they are indexable here too; see LEADS_NOINDEX_THANK_YOU.
 */
function meta(path: string, title: string, description?: string, canonicalPath = path): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: absoluteUrl(canonicalPath) },
    openGraph: { title, description, url: absoluteUrl(canonicalPath), locale: 'he_IL', type: 'website' },
  };
}

/** Set to true to noindex thank-you pages (SEO best practice; the live site indexes them). */
export const LEADS_NOINDEX_THANK_YOU = false;
const thankYouRobots: Pick<Metadata, 'robots'> = LEADS_NOINDEX_THANK_YOU ? { robots: { index: false, follow: true } } : {};

export function thankYouMetadata(): Metadata {
  return { ...meta('/thank-you/', 'תודה - בונים בית'), ...thankYouRobots };
}

/** Special pages owned by the leads workstream, keyed by decoded root-level slug. */
export const leadsPages: SpecialPageRegistry = {
  'צור-קשר': {
    load: () => import('@/components/leads/pages/ContactPage'),
    metadata: () =>
      meta(
        '/צור-קשר/',
        'צור קשר - בונים בית',
        'צרו עמנו קשר במגוון דרכים. אם יש לכם שאלה כלשהי, התייעצות או רוצים להתחיל תהליך ליווי לבניית הבית שלכם. השאירו פרטים וצרו עמנו קשר כאן >>>',
      ),
  },
  'הצטרפו-לקבוצות-הווטסאפ': {
    load: () => import('@/components/leads/pages/WhatsappJoinPage'),
    metadata: () =>
      meta(
        '/הצטרפו-לקבוצות-הווטסאפ/',
        'הצטרפו לקבוצות הווטסאפ - בונים בית',
        'הצטרפו לקהילת בונים בית, הקהילה הגדולה בישראל לבונים ומשפצים פרטיים. קבוצות WhatsApp אזוריות לליווי, ייעוץ והתייעצויות בזמן אמת.',
      ),
  },
  // Live 301s this to /thank-you/ (seeded in `redirects`); rendered as the
  // same page if the redirect row is ever disabled.
  'תודה-על-השארת-פרטים': {
    load: () => import('@/components/leads/pages/ThankYouPage'),
    metadata: () => thankYouMetadata(),
  },
  'תודה-על-השארת-פרטים-מוצר': {
    load: () => import('@/components/leads/pages/ThankYouProductPage'),
    metadata: () => ({
      ...meta('/תודה-על-השארת-פרטים-מוצר/', 'תודה על השארת פרטים -מוצר - בונים בית', 'תודה שיצרת קשר! נחזור אליכם בהקדם'),
      ...thankYouRobots,
    }),
  },
};
