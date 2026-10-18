import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CalendarCheck, Clock3, Mic } from 'lucide-react';
import Breadcrumbs from '@/components/content/Breadcrumbs';
import PlannerApp from '@/components/planner/PlannerApp';
import { PlannerSkeleton } from '@/components/planner/PlannerSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { loadPriceBook } from '@/lib/planner/price-book';
import { PLANNER_TITLE } from '@/lib/planner/content';
import { asOfBadge } from '@/lib/planner/format';
import { absoluteUrl } from '@/lib/site';

// The price book changes rarely; admin saves revalidate this path at once.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${PLANNER_TITLE}: כמה יעלה לבנות בית פרטי ב-2026`,
  description:
    'חמש שאלות על הבית, וטווח עלות לתכנון ובנייה לפי 7 שלבי הבנייה, נכון ל-2026. מבוסס על מאות תקציבי בנייה של בונים בית, עם הרגעים בפודקאסט שבהם הכי קל לחרוג.',
  alternates: { canonical: absoluteUrl('/calculator/') },
};

export default async function CalculatorPage() {
  const { book } = await loadPriceBook();

  return (
    <>
      <PageHeader
        crumbs={
          <Breadcrumbs
            crumbs={[
              { label: 'ראשי', href: '/' },
              { label: 'מחשבון תקציב', href: '/calculator/' },
            ]}
          />
        }
        eyebrow={PLANNER_TITLE}
        title="כמה יעלה הבית שלכם?"
        description="חמש שאלות, ואתם מקבלים טווח לתכנון ובנייה לפי שבעת השלבים, עם המקומות שבהם הכי קל לחרוג. לפי מאות תקציבי בנייה שערכנו."
        className="pb-4"
      >
        <ul className="flex flex-wrap gap-2" aria-label="על המחשבון">
          <li>
            <Badge tone="sand" icon={<CalendarCheck />}>
              {asOfBadge(book.validAsOf)}
            </Badge>
          </li>
          <li>
            <Badge tone="sand" icon={<Mic />}>
              מבוסס על פרקים 107 ו-109 בפודקאסט
            </Badge>
          </li>
          <li>
            <Badge tone="sand" icon={<Clock3 />}>
              בלי הרשמה, תוצאה מיד
            </Badge>
          </li>
        </ul>
      </PageHeader>
      <div className="container-page pb-16 pt-8 sm:pb-24 sm:pt-10">
        <Suspense fallback={<PlannerSkeleton />}>
          <PlannerApp book={book} />
        </Suspense>
      </div>
    </>
  );
}
