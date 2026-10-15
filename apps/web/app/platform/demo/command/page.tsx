import type { Metadata } from 'next';
import CommandCenter from '@/components/command/CommandCenter';
import { NextVideos, nextVideos } from '@/components/command/Insights';
import LeadsAnalyticsView from '@/components/command/LeadsAnalyticsView';
import { demoCommandCenter, demoInsights, demoLeadsAnalytics } from '@/lib/command/demo';
import { formatCount } from '@/lib/command/format';
import { parsePeriod } from '@/lib/command/period';
import type { PeriodDays } from '@/lib/command/types';

export const metadata: Metadata = { title: 'חדר הבקרה' };

/**
 * P4 demo view: the owner's Command Center rendered by the real components
 * from the deterministic fixture (lib/demo/fixtures/command.ts). No auth, DB
 * or API calls; the banner and noindex come from the /platform layouts.
 */
export default function CommandDemoPage({ searchParams }: { searchParams: { period?: string } }) {
  const period = parsePeriod(searchParams.period);
  const data = demoCommandCenter(period);
  const insights = demoInsights();
  const next = nextVideos(insights.topics);
  const gapAsks = next.reduce((a, t) => a + t.asks, 0);
  const analytics = demoLeadsAnalytics(period);
  const periodHref = (days: PeriodDays) => `/platform/demo/command/?period=${days}`;

  return (
    <div className="container-page space-y-10 py-8 sm:py-12">
      <header className="max-w-3xl">
        <p className="eyebrow">חדר הבקרה</p>
        <h1 className="mt-1 text-headline text-ink-900">כל העסק במסך אחד</h1>
        <p className="mt-3 text-body-lg text-ink-600">
          כמה כסף מחכה בצבר, מי הלידים החמים, איך השותפים עומדים ביעד, כמה עולה ה-AI, ואיזה סרטונים לצלם עכשיו כי בונים שואלים עליהם ואין להם עדיין תשובה טובה.
        </p>
        <nav aria-label="בעמוד הזה" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <a href="#dashboard" className="text-primary-700 hover:underline">
            המסך הראשי
          </a>
          <a href="#next-videos" className="text-primary-700 hover:underline">
            10 הסרטונים הבאים
          </a>
          <a href="#leads" className="text-primary-700 hover:underline">
            ניתוח לידים
          </a>
        </nav>
      </header>

      <section id="dashboard" aria-label="המסך הראשי" className="scroll-mt-24">
        <CommandCenter
          data={data}
          periodHref={periodHref}
          links={{ leads: null, insights: '#next-videos', leadsAnalytics: '#leads', content: null, digest: null, pipelineSettings: null }}
        />
      </section>

      <section id="next-videos" aria-labelledby="next-videos-title" className="scroll-mt-24 space-y-4">
        <div className="max-w-3xl">
          <h2 id="next-videos-title" className="text-headline-sm text-ink-900">
            10 הסרטונים הבאים
          </h2>
          <p className="mt-2 text-body text-ink-600">
            בונים שאלו החודש <bdi dir="ltr" className="font-bold text-ink-900">{formatCount(gapAsks)}</bdi> שאלות שאין לכם עליהן סרטון או מאמר מספיק טוב.
            המערכת קיבצה אותן לנושאים, בדקה מול כל הסרטונים והמאמרים, והציעה כותרת לכל סרטון.
          </p>
        </div>
        <NextVideos topics={next} />
      </section>

      <section id="leads" aria-labelledby="leads-title" className="scroll-mt-24 space-y-4">
        <div className="max-w-3xl">
          <h2 id="leads-title" className="text-headline-sm text-ink-900">
            ניתוח לידים
          </h2>
          <p className="mt-2 text-body text-ink-600">מאיפה הלידים מגיעים, באיזה שלב ואזור הם נמצאים, איך הם מדורגים, וכמה מהר הצוות חוזר אליהם.</p>
        </div>
        <LeadsAnalyticsView data={analytics} />
      </section>
    </div>
  );
}
