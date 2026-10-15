import type { Metadata } from 'next';
import Link from 'next/link';
import { Gauge, MessageCircleQuestion, Search, SearchCheck } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/Card';
import ColumnSpark from '@/components/command/ColumnSpark';
import PeriodSelector from '@/components/command/PeriodSelector';
import { DeltaText, Tile, vsPreviousLabel } from '@/components/command/Tile';
import { requireRole } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { formatCount, formatShare, formatUsd } from '@/lib/command/format';
import { parsePeriod } from '@/lib/command/period';
import { loadSearchStats } from '@/lib/command/search-stats';
import type { PeriodDays } from '@/lib/command/types';

export const metadata: Metadata = { title: 'חיפושים ותשובות' };

/**
 * Search and AI-answer usage, from first-party analytics (platform_events).
 * Admins only. Replaces the old page that proxied to the retired FastAPI
 * backend (502 in production).
 */
export default async function SearchStatsPage({ searchParams }: { searchParams: { period?: string } }) {
  await requireRole('admin', '/admin/search-stats/');
  const period = parsePeriod(searchParams.period);
  const s = await loadSearchStats(period);
  const vs = vsPreviousLabel(period);
  const insightsOn = isEnabled('commandCenter');
  const href = (days: PeriodDays) => `/admin/search-stats/?period=${days}`;

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title="חיפושים ותשובות"
        description="כמה מחפשים באתר, כמה שאלות נשלחו ליועץ ונענו, ומה הכי שואלים. נתונים מהאנליטיקס של האתר, בלי בוטים."
        actions={
          insightsOn ? (
            <Link href="/admin/insights/" className="text-sm font-semibold text-primary-700 hover:underline">
              לשאלות שעוד לא עניתם עליהן
            </Link>
          ) : undefined
        }
      />
      <PeriodSelector current={period} href={href} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile id="ss-searches" title="חיפושים" icon={<Search />} explain="חיפושים שנשלחו מתיבות החיפוש באתר." value={formatCount(s.searches.current)} sub={<DeltaText delta={s.searches} label={vs} />} />
        <Tile id="ss-questions" title="שאלות ליועץ" icon={<MessageCircleQuestion />} explain="בקשות לתשובה חכמה (לפני בדיקת קצב ותקציב)." value={formatCount(s.questions.current)} sub={<DeltaText delta={s.questions} label={vs} />} />
        <Tile
          id="ss-answered"
          title="תשובות מלאות"
          icon={<SearchCheck />}
          explain="תשובות שהושלמו. השאר קיבלו מקורות בלבד: מגבלת קצב, תקרת עלות או תקלה."
          value={formatCount(s.answered.current)}
          sub={
            <p className="text-sm text-ink-600">
              <bdi dir="ltr" className="font-semibold text-ink-900">{formatShare(s.questions.current ? s.answered.current / s.questions.current : null)}</bdi> מהשאלות · בלי תשובה מלאה:{' '}
              <bdi dir="ltr">{formatCount(s.unanswered)}</bdi>
            </p>
          }
        />
        <Tile
          id="ss-cost"
          title="עלות AI בתקופה"
          icon={<Gauge />}
          explain="כל המסלולים שמשתמשים במודלים, לפי הרישום בעלויות."
          value={formatUsd(s.ai.costUsd)}
          sub={
            <p className="text-sm text-ink-600">
              היום <bdi dir="ltr" className="font-semibold text-ink-900">{formatUsd(s.ai.spentTodayUsd)}</bdi> מתוך תקרה של <bdi dir="ltr">{formatUsd(s.ai.budgetUsd)}</bdi>
            </p>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card as="section" padding="none" aria-labelledby="ss-daily-s" className="p-4 sm:p-5">
          <h2 id="ss-daily-s" className="mb-3 text-title-sm text-ink-900">
            חיפושים ביום
          </h2>
          <ColumnSpark points={s.dailySearches} label={`חיפושים ביום, ${period} הימים האחרונים`} unit="חיפושים" size="md" />
        </Card>
        <Card as="section" padding="none" aria-labelledby="ss-daily-q" className="p-4 sm:p-5">
          <h2 id="ss-daily-q" className="mb-3 text-title-sm text-ink-900">
            שאלות ליועץ ביום
          </h2>
          <ColumnSpark points={s.dailyQuestions} label={`שאלות ליועץ ביום, ${period} הימים האחרונים`} unit="שאלות" size="md" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card as="section" padding="none" aria-labelledby="ss-top-s" className="min-w-0 p-4 sm:p-5">
          <h2 id="ss-top-s" className="text-title-sm text-ink-900">
            החיפושים הנפוצים
          </h2>
          {s.topSearches.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">אין עדיין חיפושים בתקופה.</p>
          ) : (
            <ol className="mt-3 divide-y divide-ink-100 text-sm">
              {s.topSearches.map((q) => (
                <li key={q.value} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 break-words text-ink-800">{q.value}</span>
                  <bdi dir="ltr" className="shrink-0 font-semibold tabular-nums text-ink-900">
                    {formatCount(q.events)}
                  </bdi>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card as="section" padding="none" aria-labelledby="ss-top-q" className="min-w-0 p-4 sm:p-5">
          <h2 id="ss-top-q" className="text-title-sm text-ink-900">
            השאלות הנפוצות ליועץ
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">שאלה נספרת פעם אחת לכל מבקר ביום. ביטחון: איך התשובה העריכה את המקורות שלה.</p>
          {s.topQuestions.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">אין עדיין שאלות בתקופה.</p>
          ) : (
            <ol className="mt-3 divide-y divide-ink-100 text-sm">
              {s.topQuestions.map((q) => (
                <li key={q.question} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 break-words text-ink-800">
                    {q.question}
                    {q.zeroSourceAnswers > 0 && <span className="ms-2 text-xs text-danger-700">({q.zeroSourceAnswers} בלי מקורות)</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-500">
                    <bdi dir="ltr" className="text-sm font-semibold tabular-nums text-ink-900">{formatCount(q.asks)}</bdi>
                    {q.avgConfidence != null && (
                      <>
                        {' '}
                        · ביטחון <bdi dir="ltr">{formatShare(q.avgConfidence)}</bdi>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
