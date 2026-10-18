import type { Metadata } from 'next';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'חיפוש',
  description:
    'חפשו בסרטונים, בפרקי הפודקאסט ובמאמרים של בונים בית, וקבלו תשובה מהשטח עם הרגע המדויק בסרטון.',
  alternates: {
    canonical: absoluteUrl('/search'),
  },
  robots: {
    index: false,
    follow: true,
  },
};

// Re-export the client component from a separate file
export { default } from './SearchClient';
