import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'חיפוש',
  description:
    'חפשו בין מאות סרטוני בנייה פרטית וקבלו תשובות מבוססות AI. חיפוש לפי נושא, קטגוריה ומילות מפתח.',
  alternates: {
    canonical: 'https://bonimbait.com/search',
  },
  robots: {
    index: false,
    follow: true,
  },
};

// Re-export the client component from a separate file
export { default } from './SearchClient';
