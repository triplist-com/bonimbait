import { commerceMetadata } from '@/lib/commerce/seo';
import type { SpecialPageRegistry } from './types';

/** Special pages owned by the commerce workstream, keyed by decoded root-level slug. */
export const commercePages: SpecialPageRegistry = {
  // "חנות ההטבות" — the benefits shop front (live page 74574). /shop/ 308s here.
  'הטבות-לקהילה': {
    load: () => import('@/components/commerce/BenefitsPage'),
    metadata: () =>
      commerceMetadata({
        title: 'הטבות לקהילה - בונים בית',
        description:
          'קונים חכם עם כוחה של הקהילה – ספקים בדוקים, מחירים משתלמים והטבות לחברי קהילת בונים בית: הנחות, אחריות ושקט נפשי בכל רכישה.',
        path: '/הטבות-לקהילה/',
        // Live Yoast robots: index, nofollow.
        nofollow: true,
      }),
  },
};
