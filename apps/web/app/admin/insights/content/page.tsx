import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Eye, FileText, MessageSquareQuote, PlayCircle, Users } from 'lucide-react';
import PageHeader from '@/components/admin/PageHeader';
import { Card } from '@/components/ui/Card';
import PeriodSelector from '@/components/command/PeriodSelector';
import { BarRows } from '@/components/command/marks';
import { Tile } from '@/components/command/Tile';
import { isEnabled } from '@/lib/flags';
import type { ContentRow } from '@/lib/command/content';
import { loadContentPerformance } from '@/lib/command/content-load';
import { formatCount } from '@/lib/command/format';
import { parsePeriod } from '@/lib/command/period';
import type { PeriodDays } from '@/lib/command/types';

export const metadata: Metadata = { title: 'ביצועי תוכן' };

function Section({ id, title, explain, rows, measure, unit, empty }: { id: string; title: string; explain: string; rows: ContentRow[]; measure: (r: ContentRow) => number; unit: string; empty: string }) {
  return (
    <Card as="section" padding="none" aria-labelledby={`${id}-title`} className="min-w-0 p-4 sm:p-5">
      <h2 id={`${id}-title`} className="text-title-sm text-ink-900">
        {title}
      </h2>
      <p className="mt-0.5 text-xs text-ink-500">{explain}</p>
      <BarRows
        className="mt-4"
        labelWidth="w-40 sm:w-64"
        rows={rows.map((r) => ({ key: r.key, label: r.title, value: measure(r), display: `${formatCount(measure(r))} ${unit}`, href: r.href }))}
        empty={empty}
      />
    </Card>
  );
}

/** Content performance: views, sources cited in answers, and the leads content brought in. Editors and admins. */
export default async function ContentPerformancePage({ searchParams }: { searchParams: { period?: string } }) {
  if (!isEnabled('commandCenter')) notFound();
  const period = parsePeriod(searchParams.period);
  const data = await loadContentPerformance(period);
  const href = (days: PeriodDays) => `/admin/insights/content/?period=${days}`;

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        title="ביצועי תוכן"
        description="אילו סרטונים ומאמרים נצפים, על מה התשובות באתר נשענות, ואיזה תוכן מביא לידים."
        back={{ href: '/admin/', label: 'חדר הבקרה' }}
      />
      <PeriodSelector current={period} href={href} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile id="cp-views" title="צפיות בתוכן" icon={<Eye />} explain="צפיות בעמודי סרטונים ומאמרים באתר." value={formatCount(data.totals.contentViews)} />
        <Tile id="cp-cited" title="ציטוטים בתשובות" icon={<MessageSquareQuote />} explain="כמה פעמים סרטון או מאמר הופיעו כמקור מתחת לתשובה." value={formatCount(data.totals.citations)} />
        <Tile id="cp-clicks" title="פתיחות מקור" icon={<PlayCircle />} explain="לחיצות על מקור מתחת לתשובה." value={formatCount(data.totals.clicks)} />
        <Tile id="cp-leads" title="לידים מתוכן" icon={<Users />} explain="לידים שהנגיעה האחרונה שלהם (עד 4 שעות לפני) הייתה מקור בתשובה." value={formatCount(data.totals.attributedLeads)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section id="cp-videos" title="הסרטונים הנצפים ביותר" explain="צפיות בעמוד הסרטון." rows={data.videos} measure={(r) => r.views} unit="צפיות" empty="אין עדיין צפיות בסרטונים בתקופה." />
        <Section id="cp-articles" title="המאמרים הנצפים ביותר" explain="צפיות בעמוד המאמר." rows={data.articles} measure={(r) => r.views} unit="צפיות" empty="אין עדיין צפיות במאמרים בתקופה." />
        <Section
          id="cp-cited-list"
          title="המקורות שהתשובות נשענות עליהם"
          explain="ציטוטים מתחת לתשובות (כשהיועץ מדווח עליהם) ופתיחות של המקור."
          rows={data.cited}
          measure={(r) => r.citations || r.clicks}
          unit="פעמים"
          empty="יופיע כשהיועץ ידווח אילו מקורות הוצגו בכל תשובה, או כשבונים יפתחו מקור."
        />
        <Section
          id="cp-lead-content"
          title="תוכן שהביא לידים"
          explain="המקור בתשובה שבונים פתחו לפני שהשאירו פרטים (נגיעה אחרונה, עד 4 שעות)."
          rows={data.leadsFromAnswers}
          measure={(r) => r.leads}
          unit="לידים"
          empty="עוד אין לידים שהגיעו ממקור בתשובה."
        />
        <Section
          id="cp-lead-pages"
          title="עמודי תוכן שמהם נשלחו לידים"
          explain="העמוד שבו מילאו את הטופס."
          rows={data.leadsByPage}
          measure={(r) => r.leads}
          unit="לידים"
          empty="עוד אין לידים שנשלחו מעמודי סרטונים או מאמרים."
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <FileText className="size-3.5" aria-hidden="true" />
        צפיות נספרות מהאנליטיקס של האתר, בלי בוטים ובלי עמודי הניהול.
      </p>
    </div>
  );
}
