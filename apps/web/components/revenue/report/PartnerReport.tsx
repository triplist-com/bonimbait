import Link from 'next/link';
import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import type { DealResult } from '@/lib/revenue/actions/portal';
import type { PartnerReportData } from '@/lib/revenue/report';
import type { ReportLead } from '@/lib/revenue/report-server';
import DealButton from '../portal/DealButton';
import PrintButton from './PrintButton';

const NUM = new Intl.NumberFormat('he-IL');
const NIS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat('he-IL', { style: 'percent', maximumFractionDigits: 1 });

/** Sequential magenta for ordinal funnel steps (DESIGN_SYSTEM §4: start at 300). */
const STEP_TONES = ['bg-primary-300', 'bg-primary-400', 'bg-primary-500', 'bg-primary-600', 'bg-primary-700', 'bg-primary-800'];

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const tone = pct > 0 ? 'text-success-700' : pct < 0 ? 'text-danger-700' : 'text-ink-500';
  return (
    <span dir="ltr" className={cn('text-xs font-semibold', tone)}>
      <span aria-hidden="true">{pct > 0 ? '▲' : pct < 0 ? '▼' : '•'}</span> {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

function Card({ children, className, tone = 'white' }: { children: ReactNode; className?: string; tone?: 'white' | 'ink' }) {
  return (
    <section
      className={cn(
        'rounded-3xl border p-5 shadow-card print:shadow-none sm:p-7',
        tone === 'ink' ? 'border-ink-900 bg-ink-950 text-white print:border-ink-200 print:bg-white print:text-ink-900' : 'border-ink-100 bg-white',
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * "דוח שותף": one partner, one month. The funnel from viewable exposures to
 * deals, the ROI estimate with its method, and the month's leads (where the
 * partner marks deals). Server-safe; printable (only #partner-report prints).
 */
export default function PartnerReport({
  data,
  leads,
  dealAction,
  months,
  monthHref,
  demo = false,
  readOnly = false,
}: {
  data: PartnerReportData;
  leads: ReportLead[];
  dealAction?: (fd: FormData) => Promise<DealResult>;
  /** Month switcher (newest first) and its link builder. */
  months?: string[];
  monthHref?: (month: string) => string;
  demo?: boolean;
  /** Staff viewing a partner's report: deals are the partner's to mark. */
  readOnly?: boolean;
}) {
  const max = Math.max(1, ...data.funnel.map((s) => s.value));
  const r = data.roi;

  return (
    <div id="partner-report" className="space-y-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #partner-report, #partner-report * { visibility: visible !important; }
        #partner-report { position: absolute; inset: 0; padding: 12mm; }
        @page { size: A4; margin: 0; }
      }`}</style>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">דוח שותף · {data.monthLabel}</p>
          <h1 className="mt-1 text-headline text-ink-900">{data.partner.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-600">
            {data.partner.tierName ? <Badge tone="brand">מסלול {data.partner.tierName}</Badge> : <Badge tone="outline">בלי מסלול בתשלום</Badge>}
            {data.partner.topicTitle && <span>התחום הנמדד: {data.partner.topicTitle}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Logo className="hidden h-7 text-ink-900 print:block" />
          <PrintButton />
        </div>
      </header>

      {months && monthHref && (
        <nav aria-label="בחירת חודש" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 print:hidden">
          {months.map((m) => (
            <Link
              key={m}
              href={monthHref(m)}
              aria-current={m === data.month ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset',
                m === data.month ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300',
              )}
            >
              <span className="num">{m.slice(5, 7)}/{m.slice(2, 4)}</span>
            </Link>
          ))}
        </nav>
      )}

      {data.highlights.length > 0 && (
        <Card tone="ink">
          <h2 className="text-title-lg">החודש במשפט אחד</h2>
          <ul className="mt-3 space-y-2 text-body-lg text-white/85 print:text-ink-800">
            {data.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <h2 className="text-title-lg text-ink-900">מהחשיפה ועד העסקה</h2>
          <p className="mt-1 text-sm text-ink-600">כל שלב והאחוז שעבר ממנו לשלב הבא.</p>
          <ol className="mt-5 space-y-4">
            {data.funnel.map((s, i) => (
              <li key={s.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink-900">{s.label}</span>
                  <span className="flex items-baseline gap-2">
                    {s.rate !== null && <span className="text-xs text-ink-500">{PCT.format(s.rate)} מהשלב הקודם</span>}
                    <span className="num text-xl font-extrabold text-ink-900">{NUM.format(s.value)}</span>
                  </span>
                </div>
                <span aria-hidden="true" className="mt-1.5 block h-3 overflow-hidden rounded-full bg-ink-100">
                  <span
                    className={cn('block h-full rounded-full', STEP_TONES[i] ?? 'bg-primary-800')}
                    style={{ width: `${s.value > 0 ? Math.max(4, Math.sqrt(s.value / max) * 100) : 0}%` }}
                  />
                </span>
                <span className="mt-1 block text-caption text-ink-500">{s.hint}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-caption text-ink-500">רוחב הפסים בסקאלת שורש, כדי שגם השלבים הקטנים ייראו. המספרים מדויקים.</p>
        </Card>

        <div className="space-y-6">
          <Card className="text-center">
            <h2 className="text-title text-ink-900">החזר משוער על ההשקעה</h2>
            {r.multiple !== null ? (
              <>
                <p className="mt-2 text-6xl font-extrabold text-primary-700">
                  <span className="num">×{r.multiple}</span>
                </p>
                <p className="mt-3 text-sm text-ink-700">
                  רווח גולמי משוער <span className="num font-semibold">{NIS.format(r.marginAgorot / 100)}</span>
                  <br />
                  חלקי עלות השותפות <span className="num font-semibold">{NIS.format((r.costAgorot ?? 0) / 100)}</span>
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-600">{r.missing}</p>
            )}
            <p className="mt-4 text-caption text-ink-500">
              לפי {Math.round(r.marginRate * 100)}% רווח גולמי מערך העסקאות שדווחו
              {data.deals.withValue < data.deals.count ? ', ועסקה בלי סכום מוערכת בממוצע החודש' : ''}.
            </p>
          </Card>

          <Card>
            <h2 className="text-title text-ink-900">לעומת החודש הקודם</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['חשיפות נצפות', data.funnel[0].value, data.change.exposures],
                ['פניות', data.funnel[4].value, data.change.leads],
                ['עסקאות', data.deals.count, data.change.deals],
              ].map(([label, value, pct]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-700">{label}</dt>
                  <dd className="flex items-baseline gap-2">
                    <Change pct={pct as number | null} />
                    <span className="num font-bold text-ink-900">{NUM.format(Number(value))}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {data.assistedLeads > 0 && (
              <p className="mt-3 text-caption text-ink-500">
                ועוד <span className="num">{NUM.format(data.assistedLeads)}</span> פניות לבונים בית שהגיעו אחרי לחיצה על ההצעה שלכם.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <h2 className="text-title-lg text-ink-900">הפניות של החודש ({leads.length})</h2>
        {!readOnly && <p className="mt-1 text-sm text-ink-600">סגרתם עסקה? סמנו אותה כאן, וההחזר יתעדכן.</p>}
        {leads.length === 0 ? (
          <p className="mt-4 text-body-sm text-ink-600">לא היו פניות החודש.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="font-semibold text-ink-900">{l.name}</span>{' '}
                  <span dir="ltr" className="font-mono text-xs text-ink-500">
                    {l.ref}
                  </span>
                  <span className="block text-caption text-ink-500">
                    {l.kindLabel} · {l.statusLabel} · {new Date(l.createdAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                  </span>
                </span>
                {l.deal ? (
                  <Badge tone="success" icon={<Trophy />}>
                    עסקה{l.deal.valueAgorot ? ` · ${NIS.format(l.deal.valueAgorot / 100)}` : ''}
                  </Badge>
                ) : readOnly ? null : (
                  <span className="print:hidden">
                    <DealButton businessId={data.partner.id} leadId={l.id} action={dealAction} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <footer className="text-caption text-ink-500">
        <p>
          חשיפה נספרת רק כשלפחות חצי מההצעה נראתה על המסך שנייה ומעלה, אצל גולש פעיל, פעם אחת לחצי שעה. פנייה משויכת לשותף כשהלחיצה על ההצעה הייתה
          המגע האחרון בארבע השעות שלפניה. שאלות נספרות לפי בונים שונים, בלי פרטים מזהים.
        </p>
        <p className="mt-1">{demo ? 'תצוגת הדגמה · נתונים לדוגמה.' : 'הדוח הופק אוטומטית על ידי בונים בית.'}</p>
      </footer>
    </div>
  );
}
