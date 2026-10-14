import type { Metadata } from 'next';
import BarList from '@/components/platform/demo/BarList';
import DailyColumns from '@/components/platform/demo/DailyColumns';
import StatTile from '@/components/platform/demo/StatTile';
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { foundationDemo } from '@/lib/demo/fixtures/foundation';
import { agoHe, formatNumberHe } from '@/lib/demo/format';

export const metadata: Metadata = { title: 'ערכת נתוני ההדגמה' };
// Fixtures are anchored to Israel's date: refresh hourly so "today" moves on.
export const revalidate = 3600;

/**
 * Reference demo view (the pattern every /platform/demo/<squad>/ follows):
 * a Server Component that loads its squad fixture and renders real UI from it.
 * No auth, no DB, no API calls; the banner comes from ../layout.tsx.
 */
export default function FoundationDemoPage() {
  const data = loadDemoFixture(foundationDemo);
  const { kpis } = data;

  return (
    <div className="container-page space-y-6 py-8 sm:py-12">
      <header>
        <p className="text-sm font-semibold text-primary-700">ערכת ההדגמה של הפלטפורמה</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">תמונת מצב לדוגמה: 28 הימים האחרונים</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">
          כל המספרים, השמות והפניות כאן נוצרו במחולל נתונים קבוע, כדי שכל הדגמה תיראה אמיתית ותהיה זהה בכל הצגה, בלי לגעת במידע של בונים או
          לקוחות.
        </p>
      </header>

      <section aria-label="מדדים מרכזיים" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="מבקרים ייחודיים" value={formatNumberHe(kpis.visitors.value)} delta={kpis.visitors.change} />
        <StatTile label="לידים" value={formatNumberHe(kpis.leads.value)} delta={kpis.leads.change} />
        <StatTile label="שיעור המרה" value={`${kpis.conversion.value}%`} delta={kpis.conversion.change} />
        <StatTile label="שאלות מובילות שקיבלו מענה" value={`${kpis.answered.value}%`} hint="מתוך 6 השאלות הנפוצות" />
      </section>

      <DailyColumns
        title="מבקרים ייחודיים ביום"
        description="8 שבועות: צמיחה של כ-3.5% בשבוע, ירידה בשישי ובשבת"
        points={data.visitors}
        unit="מבקרים"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-gray-900">לידים אחרונים</h2>
          <ul className="mt-3 divide-y divide-gray-100">
            {data.recentLeads.map((lead) => (
              <li key={lead.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium text-gray-900">{lead.person.fullName}</p>
                  <p className="text-xs text-gray-500">
                    <span dir="ltr" className="font-mono">
                      {lead.ref}
                    </span>{' '}
                    · {agoHe(lead.minutesAgo)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {LEAD_TYPE_LABELS[lead.type]} · {lead.place.city} · {lead.stage.label}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{lead.source.label}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{lead.budgetBand}</span>
                  <span className="rounded-full bg-primary-50 px-2 py-0.5 font-semibold text-primary-800">ציון {lead.score}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <BarList
            title="לידים לפי אזור"
            description="28 הימים האחרונים, ששת האזורים המובילים"
            rows={data.byRegion.map((r) => ({ key: r.slug, label: r.name, value: r.leads }))}
            unit="לידים"
          />

          <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-semibold text-gray-900">מה בונים שואלים</h2>
            <ol className="mt-3 space-y-3">
              {data.questions.map((q, i) => (
                <li key={q.text} className="flex gap-3 text-sm">
                  <span className="w-5 shrink-0 text-gray-500 tabular-nums">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900">{q.text}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>
                        נשאלה <bdi>{formatNumberHe(q.asks)}</bdi> פעמים · {q.topic}
                      </span>
                      {!q.answered && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">פער תוכן: כדאי סרטון</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
