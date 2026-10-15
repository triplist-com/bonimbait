import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Lightbulb, MessageCircleQuestion } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { DemoNotice } from '@/components/command/DemoNotice';
import { NextVideos, TopicsTable, nextVideos } from '@/components/command/Insights';
import RefreshInsightsButton from '@/components/command/RefreshInsightsButton';
import { agoHe } from '@/lib/demo/format';
import { isEnabled } from '@/lib/flags';
import { commandUserDb } from '@/lib/command/db';
import { demoInsights } from '@/lib/command/demo';
import { formatCount, formatUsd } from '@/lib/command/format';
import { DEFAULT_INSIGHTS_CONFIG } from '@/lib/command/insights/engine';
import { loadInsights } from '@/lib/command/insights/store';
import { minutesBetween } from '@/lib/command/period';
import type { InsightRunSummary, InsightTopic } from '@/lib/command/types';

export const metadata: Metadata = { title: 'השאלות שעוד לא עניתם עליהן' };

const RUN_STATUS: Record<string, string> = {
  done: 'הושלם',
  partial: 'הושלם חלקית',
  empty: 'לא נמצאו שאלות',
  failed: 'נכשל',
  budget: 'נעצר בגלל תקציב ה-AI',
  running: 'רץ עכשיו',
};

/**
 * The content-gap engine (P4): what builders ask that the owner's videos and
 * articles don't answer well, as the next 10 videos. Editors and admins;
 * ?demo=1 shows the demo run.
 */
export default async function InsightsPage({ searchParams }: { searchParams: { demo?: string } }) {
  if (!isEnabled('commandCenter')) notFound();
  const demo = searchParams.demo === '1';
  let latest: InsightRunSummary | null = null;
  let shown: { run: InsightRunSummary; topics: InsightTopic[] } | null = null;
  let loadError = false;
  if (demo) {
    shown = demoInsights();
    latest = shown.run;
  } else {
    try {
      ({ latest, shown } = await loadInsights(commandUserDb()));
    } catch (err) {
      console.error(`[command] insights load failed: ${err instanceof Error ? err.message : String(err)}`);
      loadError = true;
    }
  }
  const next = shown ? nextVideos(shown.topics) : [];
  const gapAsks = next.reduce((a, t) => a + t.asks, 0);
  const now = new Date().toISOString();

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="השאלות שעוד לא עניתם עליהן"
        description={`מה בונים שואלים באתר ב-${DEFAULT_INSIGHTS_CONFIG.windowDays} הימים האחרונים, מקובץ לנושאים ונבדק מול כל הסרטונים והמאמרים. נושא בלי תשובה טובה הוא הסרטון הבא.`}
        actions={demo ? undefined : <RefreshInsightsButton />}
      />
      {demo && <DemoNotice exitHref="/admin/insights/" />}
      {loadError && (
        <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          לא הצלחנו לטעון את התובנות. ייתכן שהמיגרציה של חדר הבקרה עוד לא הופעלה.
        </p>
      )}

      {latest && (
        <p className="text-sm text-ink-600">
          רענון אחרון {agoHe(minutesBetween(latest.finishedAt ?? latest.startedAt, demo ? latest.finishedAt ?? now : now))}: {RUN_STATUS[latest.status] ?? latest.status}
          {latest.questionCount > 0 && (
            <>
              {' '}
              · <bdi dir="ltr">{formatCount(latest.questionCount)}</bdi> שאלות שונות · <bdi dir="ltr">{formatCount(latest.topicCount)}</bdi> נושאים
            </>
          )}
          {latest.costUsd > 0 && (
            <>
              {' '}
              · עלות <bdi dir="ltr">{formatUsd(latest.costUsd)}</bdi>
            </>
          )}
          {latest.message && <span className="block text-ink-500">{latest.message}</span>}
        </p>
      )}

      {!shown ? (
        <EmptyState
          icon={<MessageCircleQuestion />}
          title="עוד לא נותחו שאלות"
          description="רעננו את התובנות כדי לקבץ את השאלות של הבונים לנושאים ולבדוק אילו מהם אין עליהם תוכן. כל רענון עולה פחות מסנט."
          actions={demo ? undefined : <RefreshInsightsButton label="ניתוח ראשון" />}
        />
      ) : (
        <>
          <section aria-labelledby="next-title" className="space-y-3">
            <div>
              <h2 id="next-title" className="text-title-lg text-ink-900">
                10 הסרטונים הבאים
              </h2>
              <p className="mt-1 text-sm text-ink-600">
                <bdi dir="ltr" className="font-bold text-ink-900">{formatCount(gapAsks)}</bdi> שאלות על נושאים שאין עליהם סרטון או מאמר מספיק טוב, מהנפוץ לפחות נפוץ.
              </p>
            </div>
            <NextVideos topics={next} />
          </section>

          <section aria-labelledby="all-title" className="space-y-3">
            <h2 id="all-title" className="text-title-lg text-ink-900">
              כל הנושאים
            </h2>
            <TopicsTable topics={shown.topics} />
          </section>
        </>
      )}

      <Card as="section" tone="sand" padding="md" aria-labelledby="how-title">
        <h2 id="how-title" className="flex items-center gap-2 text-title-sm text-ink-900">
          <Lightbulb className="size-4 text-primary-600" aria-hidden="true" />
          איך זה עובד
        </h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-ink-700">
          <li>אוספים את מה שבונים הקלידו בחיפוש ושאלו את היועץ, בלי פרטים אישיים, ומאחדים ניסוחים זהים.</li>
          <li>מקבצים שאלות לנושאים לפי המשמעות והמילים שלהן.</li>
          <li>שולחים את השאלות המרכזיות בכל נושא לאותו חיפוש שעונה לבונים באתר, ובודקים כמה קרוב התוכן שהוא מוצא (סרטונים עם תמלול ומאמרים).</li>
          <li>מודל שפה קטן נותן לכל נושא שם, מציע כותרת לסרטון ובודק אם התוכן הקרוב באמת עונה על השאלות.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-600">
          כל רענון נבדק מול התקרה היומית של ה-AI לפני כל קריאה בתשלום, ונרשם בעלויות. אפשר לרענן שוב אחרי {Math.round(DEFAULT_INSIGHTS_CONFIG.cooldownMs / 60_000)} דקות.
        </p>
      </Card>
    </div>
  );
}
