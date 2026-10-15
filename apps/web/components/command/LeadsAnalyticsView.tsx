import { Clock, Timer, TriangleAlert, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { BreakdownRow, LeadsAnalytics } from '@/lib/command/analytics';
import { formatCount, formatDurationHe, formatNis, formatShare } from '@/lib/command/format';
import type { ScoreBandId } from '@/lib/command/types';
import ColumnSpark from './ColumnSpark';
import { BAND_FILL, BarRows } from './marks';
import { DeltaText, Tile, vsPreviousLabel } from './Tile';

function Breakdown({ id, title, explain, rows, hideEmpty, fill }: { id: string; title: string; explain: string; rows: readonly BreakdownRow[]; hideEmpty?: boolean; fill?: (key: string) => string | undefined }) {
  const shown = hideEmpty ? rows.filter((r) => r.count > 0) : rows;
  return (
    <Card as="section" padding="none" aria-labelledby={`${id}-title`} className="min-w-0 p-4 sm:p-5">
      <h2 id={`${id}-title`} className="text-title-sm text-ink-900">
        {title}
      </h2>
      <p className="mt-0.5 text-xs text-ink-500">{explain}</p>
      <BarRows
        className="mt-4"
        rows={shown.map((r) => ({
          key: r.key,
          label: r.label,
          value: r.count,
          display: `${formatCount(r.count)} · ${formatShare(r.share)}`,
          note: r.valueAgorot > 0 ? `ערך צפוי ${formatNis(r.valueAgorot, { compact: true })}` : undefined,
          fill: fill?.(r.key),
        }))}
        empty="אין לידים בתקופה."
      />
    </Card>
  );
}

export default function LeadsAnalyticsView({ data }: { data: LeadsAnalytics }) {
  const vs = vsPreviousLabel(data.period.days);
  const s = data.speed;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile id="la-total" title="לידים בתקופה" icon={<Users />} explain="כל הפניות מכל הטפסים, בלי ספאם." value={formatCount(data.total.current)} sub={<DeltaText delta={data.total} label={vs} />} />
        <Tile
          id="la-median"
          title="זמן תגובה חציוני"
          icon={<Timer />}
          explain="מהגעת הליד עד שינוי הסטטוס הראשון שלו בתיבת הלידים."
          value={formatDurationHe(s.medianMinutes)}
          sub={
            <p className="text-sm text-ink-600">
              90% תוך <bdi dir="ltr" className="font-semibold text-ink-900">{formatDurationHe(s.p90Minutes)}</bdi> · נמדד ב-
              <bdi dir="ltr">{formatCount(s.measured)}</bdi> לידים
            </p>
          }
        />
        <Tile
          id="la-1h"
          title="טופלו תוך שעה"
          icon={<Clock />}
          explain="מתוך הלידים שכבר טופלו. בייעוץ ובמסלולים, שעה ראשונה עושה את ההבדל."
          value={formatShare(s.within1h)}
          sub={
            <p className="text-sm text-ink-600">
              תוך יום: <bdi dir="ltr" className="font-semibold text-ink-900">{formatShare(s.within24h)}</bdi>
            </p>
          }
        />
        <Tile
          id="la-overdue"
          title="מחכים יותר מיום"
          icon={<TriangleAlert />}
          explain="לידים בסטטוס חדש שהגיעו לפני יותר מ-24 שעות."
          value={formatCount(s.overdue)}
          sub={
            <p className="text-sm text-ink-600">
              עוד לא טופלו בכלל: <bdi dir="ltr" className="font-semibold text-ink-900">{formatCount(s.untouched)}</bdi>
            </p>
          }
        />
      </div>

      <Card as="section" padding="none" aria-labelledby="la-daily-title" className="p-4 sm:p-5">
        <h2 id="la-daily-title" className="text-title-sm text-ink-900">
          לידים ביום
        </h2>
        <p className="mb-3 mt-0.5 text-xs text-ink-500">לפי ימים בשעון ישראל. רחפו או השתמשו בחיצים כדי לראות כל יום.</p>
        <ColumnSpark points={data.daily} label={`לידים ביום, ${data.period.days} הימים האחרונים`} unit="לידים" size="md" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown id="la-source" title="לפי מקור" explain="נגיעה אחרונה ב-4 השעות שלפני הליד (שותף, תוכן בתשובה, קמפיין או הפניה), אחרת ישיר." rows={data.bySource} />
        <Breakdown id="la-utm" title="לפי קמפיין (UTM)" explain="utm_source / utm_campaign של לידים שהגיעו מקמפיין." rows={data.byUtm} />
        <Breakdown id="la-type" title="לפי סוג פנייה" explain="הטופס שממנו הגיע הליד." rows={data.byType} hideEmpty />
        <Breakdown
          id="la-score"
          title="לפי ציון"
          explain="הציון מתוך 100 של מנוע הלידים. כהה יותר = חם יותר."
          rows={data.byScoreBand}
          fill={(key) => BAND_FILL[key as ScoreBandId]}
        />
        <Breakdown id="la-stage" title="לפי שלב בנייה" explain="שבעת השלבים: מתיק הפרויקט, או מהשלב שבחרו בטופס." rows={data.byStage} />
        <Breakdown id="la-region" title="לפי אזור" explain="14 האזורים של הקהילה." rows={data.byRegion} hideEmpty />
      </div>

      <Card as="section" padding="none" aria-labelledby="la-speed-title" className="p-4 sm:p-5">
        <h2 id="la-speed-title" className="text-title-sm text-ink-900">
          זמן תגובה לפי סוג פנייה
        </h2>
        <p className="mt-0.5 text-xs text-ink-500">המדידה מתחילה עם עדכון הסטטוס הראשון בתיבת הלידים (מהרגע שמעקב הסטטוסים הופעל).</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">זמן תגובה חציוני לפי סוג פנייה</caption>
            <thead className="text-xs text-ink-600">
              <tr className="border-b border-ink-100">
                <th scope="col" className="py-2 text-start font-semibold">סוג</th>
                <th scope="col" className="py-2 text-start font-semibold">טופלו</th>
                <th scope="col" className="py-2 text-start font-semibold">זמן חציוני</th>
                <th scope="col" className="py-2 text-start font-semibold">עוד לא טופלו</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 tabular-nums">
              {s.byType.map((r) => (
                <tr key={r.type}>
                  <td className="py-2 text-ink-800">{r.label}</td>
                  <td className="py-2 text-ink-900">{formatCount(r.measured)}</td>
                  <td className="py-2 text-ink-900">{formatDurationHe(r.medianMinutes)}</td>
                  <td className="py-2 text-ink-900">{formatCount(r.untouched)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
