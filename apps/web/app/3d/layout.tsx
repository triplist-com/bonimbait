import type { Metadata } from 'next';

// The plan-to-3D demo (docs/build3d/SPEC.md): full-screen, not indexed.
export const metadata: Metadata = {
  title: 'מתוכנית לבית — בתלת-ממד',
  description: 'מעלים תוכנית הגשה ורואים את הבית נבנה, שלב אחר שלב, בתלת-ממד.',
  robots: { index: false, follow: false },
  // Share card: the finished house at dusk (rendered by data/tools/pw/cine-hero.mjs).
  openGraph: {
    title: 'מתוכנית לבית — בתלת-ממד',
    description: 'מעלים תוכנית הגשה ורואים את הבית נבנה, שלב אחר שלב, בתלת-ממד.',
    locale: 'he_IL',
    type: 'website',
    images: [{ url: '/build3d/og.jpg', width: 1200, height: 630, alt: 'בית פרטי בתלת-ממד בשעת ערב, בסוף תהליך הבנייה' }],
  },
  twitter: { card: 'summary_large_image', images: ['/build3d/og.jpg'] },
};

export default function Build3DLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[60] overflow-hidden bg-ink-50">{children}</div>;
}
