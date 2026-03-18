import type { Metadata } from 'next';
import VideosPageClient from './VideosPageClient';

export const metadata: Metadata = {
  title: 'כל הסרטונים',
  description:
    'עיינו בכל הסרטונים בנושא בנייה פרטית בישראל. מיון לפי תאריך, פופולריות או קטגוריה.',
  alternates: {
    canonical: 'https://bonimbait.com/videos',
  },
};

export default function VideosPage() {
  return <VideosPageClient />;
}
