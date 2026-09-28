import type { Metadata } from 'next';
import StrategicPartnersPage from '@/components/leads/pages/StrategicPartnersPage';
import { absoluteUrl } from '@/lib/site';

const title = 'בונים בית | קייס סטאדי עם יחס המרה של 25% - בונים בית';
const description =
  'ספקי בנייה ושיפוצים מצטרפים לאקוסיסטם של בונים בית ומקבלים חשיפה לקהל רלוונטי של בונים ומשפצים. קייס סטאדי פז-גז הראה יחס המרה של 25%.';

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: absoluteUrl('/strategic-partners/') },
  openGraph: {
    title: 'בונים בית | קייס סטאדי עם יחס המרה של 25%',
    description:
      '200 לידים ו-50 סגירות בחודשיים בלבד. שותפות עם בונים בית מציבה ספקים רלוונטיים מול בונים ומשפצים בזמן שהם בוחרים אנשי מקצוע.',
    url: absoluteUrl('/strategic-partners/'),
    locale: 'he_IL',
    type: 'website',
  },
};

export default StrategicPartnersPage;
