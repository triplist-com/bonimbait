import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import DemoReplay from '@/components/advisor/DemoReplay';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { advisorDemo } from '@/lib/demo/fixtures/advisor';
import { monthYear } from '@/lib/advisor/format';
import { advisorName } from '@/lib/nav';

export const metadata: Metadata = { title: advisorName() };
export const revalidate = 3600;

/**
 * Demo view of the advisor (P1): the headline question, answered from the
 * owner's own library and replayed from a real recording (lib/demo/fixtures/
 * advisor.ts), through the same components as /ask/. No API calls.
 */
export default function AdvisorDemoPage() {
  const data = loadDemoFixture(advisorDemo);
  return (
    <div className="bg-paper">
      <div className="container-page max-w-[52rem] py-8 sm:py-12">
        <header className="mb-10 max-w-2xl">
          <p className="eyebrow">
            <Sparkles aria-hidden="true" className="size-4" />
            {advisorName()}
          </p>
          <p className="mt-3 text-body text-ink-600">
            שאלה של משפחה שבונה, ותשובה מהספרייה של בונים בית: הרגעים המדויקים בפודקאסט, התשובה עם המקורות שלה, שאלות המשך והצעד הבא. זו תשובה אמיתית
            שהוקלטה מהמערכת{monthYear(data.recordedAt) ? ` (${monthYear(data.recordedAt)})` : ''}, ומוצגת כאן בלי לחכות לרשת.
          </p>
        </header>
        <DemoReplay data={data} />
      </div>
    </div>
  );
}
