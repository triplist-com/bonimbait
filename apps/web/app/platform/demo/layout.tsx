import type { Metadata } from 'next';
import DemoBanner from '@/lib/demo/DemoBanner';

export const metadata: Metadata = {
  title: { template: '%s · הדגמה · בונים בית', default: 'הדגמות · בונים בית' },
};

/** Every demo view gets the "sample data" banner from here (lib/demo, docs/platform/FOUNDATION.md). */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner />
      {children}
    </>
  );
}
