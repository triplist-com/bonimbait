import type { SpecialPageRegistry } from './types';
import { getPublishedPageBySlug } from '@/lib/db/pages';
import { getPublicDb } from '@/lib/content/db';
import { buildContentMetadata } from '@/lib/content/seo';

/** Special pages owned by the content workstream, keyed by decoded root-level slug. */
export const contentPages: SpecialPageRegistry = {
  // About: the live page is a PHP template, so the `pages` row has no body.
  'אודותינו': {
    load: () => import('@/components/content/AboutPage'),
    metadata: async () => {
      const db = getPublicDb();
      const row = db ? await getPublishedPageBySlug(db, 'אודותינו').catch(() => null) : null;
      return buildContentMetadata({
        path: '/אודותינו/',
        title: 'אודותינו',
        seoTitle: row?.seo_title || 'אודותינו - בונים בית',
        description:
          row?.seo_description ||
          'בונים בית - קהילת הבונים והמשפצים הגדולה בישראל מאז 2012: מדריך בניה שלם, ערוץ יוטיוב, פודקאסט, קבוצות וואטסאפ ובעלי מקצוע מומלצים.',
      });
    },
  },
  // Live video hub ("בונים בית TV"): lists the legacy /video/<slug>/ pages.
  'בונים-בית-tv': {
    load: () => import('@/components/content/VideoHub'),
    metadata: async () => {
      const db = getPublicDb();
      const row = db ? await getPublishedPageBySlug(db, 'בונים-בית-tv').catch(() => null) : null;
      return buildContentMetadata({
        path: '/בונים-בית-tv/',
        title: 'בונים בית TV',
        seoTitle: row?.seo_title || 'בונים בית TV - ערוץ הבניה המוביל בישראל - בונים בית',
        description:
          row?.seo_description ||
          'סרטוני בניה, סיורי שטח ופודקאסטים של בונים בית, מסודרים לפי שלבי הבניה: רכישה, תכנון, שלד, תשתיות, גמרים וכניסה לבית.',
      });
    },
  },
};
