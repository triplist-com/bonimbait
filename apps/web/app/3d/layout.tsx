import type { Metadata } from 'next';

// The plan-to-3D demo (docs/build3d/SPEC.md): full-screen, not indexed.
export const metadata: Metadata = {
  title: 'מתוכנית לבית — בתלת-ממד',
  description: 'מעלים תוכנית הגשה ורואים את הבית נבנה, שלב אחר שלב, בתלת-ממד.',
  robots: { index: false, follow: false },
};

export default function Build3DLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[60] overflow-hidden bg-[#F7F5F1]">{children}</div>;
}
