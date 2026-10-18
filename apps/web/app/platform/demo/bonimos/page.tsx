import type { Metadata } from 'next';
import DemoBonimos from '@/components/bonimos/DemoBonimos';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { bonimosDemo } from '@/lib/demo/fixtures/bonimos';

export const metadata: Metadata = { title: 'Bonim.Os' };
// Fixtures are anchored to Israel's date: refresh hourly so "today" moves on.
export const revalidate = 3600;

/**
 * P7 demo: a managed project in Bonim.Os (180 m² in the Shfela, at the shell
 * stage, forecast +2.1% over the approved budget, a payment waiting for the
 * client). The real UI on fixtures: no auth, no DB, nothing saved. The
 * banner comes from ../layout.tsx.
 */
export default function BonimosDemoPage() {
  return <DemoBonimos data={loadDemoFixture(bonimosDemo)} />;
}
