import type { Metadata } from 'next';
import VideosPageClient from './VideosPageClient';
import { absoluteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'כל הסרטונים',
  description:
    'עיינו בכל הסרטונים בנושא בנייה פרטית בישראל. מיון לפי תאריך, פופולריות או קטגוריה.',
  alternates: {
    canonical: absoluteUrl('/videos'),
  },
};

export default function VideosPage() {
  return <VideosPageClient />;
}
