import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import DailyColumns from '@/components/platform/demo/DailyColumns';
import StatTile from '@/components/platform/demo/StatTile';
import PlannerApp from '@/components/planner/PlannerApp';
import { PlannerSkeleton } from '@/components/planner/PlannerSkeleton';
import { ButtonLink } from '@/components/ui/Button';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { growthDemo } from '@/lib/demo/fixtures/growth';
import { agoHe, changePercent, formatNumberHe } from '@/lib/demo/format';
import { FINISH_LEVELS, FLOOR_LABELS } from '@/lib/planner/content';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import { rangeText } from '@/lib/planner/format';
import { reportHref } from '@/lib/planner/share';

export const metadata: Metadata = { title: 'מתכנן התקציב' };
// Fixtures are anchored to Israel's date: refresh hourly so "today" moves on.
export const revalidate = 3600;

/**
 * P6 demo: the budget planner result the tour's family sees (the real UI, from
 * fixtures and the seeded price book), and what the owner's team sees: planner
 * use and the latest estimates. No auth, DB or API calls.
 */
export default function GrowthDemoPage() {
  const data = loadDemoFixture(growthDemo);
  const { family, kpis } = data;
  const completion = Math.round((kpis.completed.value / Math.max(1, kpis.started.value)) * 100);
  const consultRate = Math.round((kpis.consults.value / Math.max(1, kpis.completed.value)) * 100);

  return (
    <div className="container-page space-y-12 py-8 sm:py-12">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary-700">P6 · תקציב ראשוני ב-3 דקות</p>
        <h1 className="mt-1 text-headline text-ink-900">המחשבון שמביא בונים לפגישת הייעוץ</h1>
        <p className="mt-3 text-body text-ink-600">
          חמש שאלות, וטווח מחירים לפי המספרים של תומר וצורי מ-2026: לפי 7 השלבים, עם לוח זמנים ועם שלושת המקומות שבהם הכי קל לחרוג. בסוף: פגישת
          ייעוץ שמגיעה עם ההערכה בתיק הפרויקט.
        </p>
      </header>

      <section aria-labelledby="demo-builder" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="demo-builder" className="text-headline-sm text-ink-900">
              מה {family.name} רואים
            </h2>
            <p className="mt-1 text-body-sm text-ink-600">
              {family.input.sizeM2} מ״ר, {FLOOR_LABELS[family.input.floors].label}, אזור השרון, גמר {FINISH_LEVELS[family.input.finishLevel].label}. בשלב
              ההיתר, עם תקציב של {rangeText({ min: family.budgetRangeNis[0], max: family.budgetRangeNis[1] })} בבית שלי.
            </p>
          </div>
          <ButtonLink href={reportHref(family.input)} variant="outline" iconStart={<FileText />}>
            הדוח שהם מורידים
          </ButtonLink>
        </div>
        <Suspense fallback={<PlannerSkeleton />}>
          <PlannerApp
            mode="demo"
            book={DEFAULT_PRICE_BOOK}
            initialInput={family.input}
            startOnResult
            source="demo"
            today={data.today}
            hubDraft={{ stage: family.stage, regionSlug: family.input.regionSlug, sizeM2: family.input.sizeM2, budgetRangeNis: family.budgetRangeNis }}
          />
        </Suspense>
      </section>

      <section aria-labelledby="demo-owner" className="space-y-5">
        <div>
          <h2 id="demo-owner" className="text-headline-sm text-ink-900">
            מה הצוות של בונים בית רואה
          </h2>
          <p className="mt-1 text-body-sm text-ink-600">28 הימים האחרונים. כל הערכה נשמרת בתיק הפרויקט ומגיעה עם הליד לתור הייעוצים.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="התחילו את המחשבון"
            value={formatNumberHe(kpis.started.value)}
            delta={changePercent(kpis.started.value, kpis.started.previous)}
          />
          <StatTile
            label="הגיעו לתוצאה"
            value={`${formatNumberHe(kpis.completed.value)} (${completion}%)`}
            delta={changePercent(kpis.completed.value, kpis.completed.previous)}
          />
          <StatTile
            label="לחצו על פגישת ייעוץ"
            value={`${formatNumberHe(kpis.consults.value)} (${consultRate}%)`}
            delta={changePercent(kpis.consults.value, kpis.consults.previous)}
          />
          <StatTile label="שמרו בבית שלי" value={formatNumberHe(kpis.saved.value)} delta={changePercent(kpis.saved.value, kpis.saved.previous)} />
        </div>
        <DailyColumns title="התחילו את המחשבון, לפי יום" description="28 ימים, עם ירידה בשישי ובשבת" points={data.series.started} unit="בונים" />
        <section aria-labelledby="demo-recent" className="rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
          <h3 id="demo-recent" className="text-title text-ink-900">
            הערכות אחרונות
          </h3>
          <ul className="mt-3 divide-y divide-ink-100">
            {data.recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <div>
                  <p className="font-semibold text-ink-900">
                    {e.city} · {e.input.sizeM2} מ״ר · גמר {FINISH_LEVELS[e.input.finishLevel].label}
                  </p>
                  <p className="text-sm text-ink-600">
                    {e.regionName} · {agoHe(e.minutesAgo)}
                    {e.consult && <span className="ms-2 rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">קבעו ייעוץ</span>}
                  </p>
                </div>
                <p className="text-body font-bold text-ink-900">{rangeText({ min: e.totalMin, max: e.totalMax })}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-ink-600">
            שמות היישובים והמספרים כאן הם נתונים לדוגמה.{' '}
            <Link href="/calculator/" className="font-semibold text-primary underline-offset-4 hover:underline">
              למחשבון האמיתי
            </Link>
          </p>
        </section>
      </section>
    </div>
  );
}
