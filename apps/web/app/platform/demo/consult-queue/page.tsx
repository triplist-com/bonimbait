import type { Metadata } from 'next';
import ConsultQueue from '@/components/revenue/ConsultQueue';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { revenueDemo } from '@/lib/demo/fixtures/revenue';
import { isConsultStage, type ConsultStage } from '@/lib/revenue/consult-workflow';

export const metadata: Metadata = { title: 'תור הייעוצים' };
// Fixtures are anchored to Israel's date: refresh hourly so "today" moves on.
export const revalidate = 3600;

const BASE = '/platform/demo/consult-queue/';

function href(q: { tab?: ConsultStage; lead?: string | null }): string {
  const params = new URLSearchParams();
  if (q.tab && q.tab !== 'queue') params.set('tab', q.tab);
  if (q.lead) params.set('lead', q.lead);
  const qs = params.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

/**
 * Demo wow #2: "צורי יודע מי מתקשר, מה הוא שאל ובאיזה שלב הוא, לפני שהרים
 * טלפון". The real consult queue (components/revenue/ConsultQueue.tsx) on
 * fixtures; quick actions change the screen only.
 */
export default function ConsultQueueDemoPage({ searchParams }: { searchParams: { tab?: string; lead?: string } }) {
  const data = loadDemoFixture(revenueDemo);
  const tab: Exclude<ConsultStage, 'spam'> = isConsultStage(searchParams.tab) && searchParams.tab !== 'spam' ? searchParams.tab : 'queue';
  const items = data.queue[tab];
  const all = Object.values(data.queue).flat();
  const selected = (searchParams.lead ? all.find((l) => l.id === searchParams.lead) : null) ?? items[0] ?? null;
  const counts = { queue: data.queue.queue.length, booked: data.queue.booked.length, contacted: data.queue.contacted.length, won: data.queue.won.length, lost: data.queue.lost.length, spam: 0 };

  return (
    <div className="container-page space-y-6 py-8 sm:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow">מנוע ההכנסות · תור הייעוצים</p>
        <h1 className="mt-1 text-headline text-ink-900">התור של צורי</h1>
        <p className="mt-2 text-body-lg text-ink-600">
          כל פנייה לייעוץ מגיעה עם תיק: השלב, האזור, הגודל, התקציב ומה שאלו באתר, והתור מסודר לפי הציון. צורי יודע מי מתקשר, מה הוא שאל ובאיזה שלב הוא, לפני
          שהרים טלפון.
        </p>
      </header>
      <ConsultQueue tab={tab} counts={counts} items={items} selected={selected} now={data.now} hrefFor={href} focus={Boolean(searchParams.lead)} />
    </div>
  );
}
