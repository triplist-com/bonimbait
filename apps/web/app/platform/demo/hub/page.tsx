import type { Metadata } from 'next';
import DemoHub from '@/components/hub/DemoHub';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { hubDemo } from '@/lib/demo/fixtures/hub';

export const metadata: Metadata = { title: 'הבית שלי' };
// Fixtures are anchored to Israel's date: refresh hourly so "today" moves on.
export const revalidate = 3600;

/**
 * P2 demo: "הבית שלי" for the fictional משפחת לוי (220 m² in the Sharon, at
 * the היתר/מכרז stage, ₪2.6M budget). The real dashboard on fixtures: no
 * auth, no DB, nothing saved. The banner comes from ../layout.tsx.
 */
export default function HubDemoPage() {
  return <DemoHub data={loadDemoFixture(hubDemo)} />;
}
