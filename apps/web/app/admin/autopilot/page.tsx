import Link from 'next/link';
import DataTable from '@/components/admin/DataTable';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import CheckChannelButton from '@/components/admin/autopilot/CheckChannelButton';
import SourceActions from '@/components/admin/autopilot/SourceActions';
import { formatDate } from '@/lib/admin/labels';
import { autopilotConfig } from '@/lib/autopilot/config';
import { budgetLimitsFromEnv } from '@/lib/autopilot/cost';
import { asAutopilotDb } from '@/lib/autopilot/db';
import { formatUsd } from '@/lib/autopilot/pricing';
import { STATUS_INFO, effectiveStatus } from '@/lib/autopilot/status';
import { listSources, statusCounts } from '@/lib/autopilot/store';
import { formatClock } from '@/lib/autopilot/transcript';
import { SOURCE_STATUSES, type SourceListRow, type SourceStatus } from '@/lib/autopilot/types';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'אוטופיילוט תוכן' };

const KIND_LABEL = { youtube: 'יוטיוב', podcast: 'פודקאסט', upload: 'העלאה' } as const;

function SummaryCard({ label, value, href, tone }: { label: string; value: number; href: string; tone?: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-card transition hover:border-primary-200 hover:shadow-card-hover">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${value > 0 && tone ? tone : 'text-gray-900'}`}>{value}</p>
    </Link>
  );
}

function EmptyState() {
  const steps = [
    ['זיהוי', 'כל בוקר המערכת בודקת את ערוץ היוטיוב (ופיד הפודקאסט, אם הוגדר) ומוסיפה לכאן סרטונים חדשים.'],
    ['תמלול', 'הכתוביות נשלפות מיוטיוב. אין כתוביות? מעלים קובץ VTT/SRT מ-YouTube Studio או מדביקים תמליל.'],
    ['סיכום ואינדוקס', 'סיכום בעברית, נקודות עיקריות, עלויות, פרקים עם חותמות זמן וחיפוש סמנטי. כמה שניות וכמה אגורות לסרטון.'],
    ['אישור ופרסום', 'אתם עוברים על הסיכום, מתקנים אם צריך ולוחצים "פרסום": עמוד וידאו, מפת אתר, חיפוש ותשובות AI.'],
  ];
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card sm:p-8">
      <h2 className="text-xl font-bold text-gray-900">ממשיכים לצלם, והאתר עושה את השאר</h2>
      <p className="mt-2 max-w-2xl text-sm text-gray-600">
        עוד אין כאן סרטונים. האוטופיילוט הופך כל סרטון חדש בערוץ לעמוד באתר עם סיכום, פרקים וחיפוש, בלי בנייה מחדש של האתר ובלי פריסה.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([title, text], i) => (
          <li key={title} className="rounded-xl bg-gray-50 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white" aria-hidden="true">
              {i + 1}
            </span>
            <p className="mt-3 font-semibold text-gray-900">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <CheckChannelButton size="lg" />
      </div>
    </section>
  );
}

function titleCell(r: SourceListRow) {
  return (
    <div className="flex min-w-[16rem] items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={r.thumbnail_url ?? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
        alt=""
        width={96}
        height={54}
        loading="lazy"
        className="h-[54px] w-24 shrink-0 rounded-md bg-gray-100 object-cover"
      />
      <div className="min-w-0">
        <Link href={`/admin/autopilot/${r.id}/`} className="line-clamp-2 font-medium text-gray-900 hover:text-primary hover:underline">
          {r.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span>{KIND_LABEL[r.kind]}</span>
          {r.duration_s ? <span dir="ltr">{formatClock(r.duration_s)}</span> : null}
          {r.is_demo && <StatusBadge label="הדגמה" tone="purple" />}
        </p>
      </div>
    </div>
  );
}

export default async function AutopilotQueuePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = asAutopilotDb(createClient());
  const raw = param(searchParams.status);
  const status = raw && (SOURCE_STATUSES as readonly string[]).includes(raw) ? (raw as SourceStatus) : null;
  const page = pageParam(searchParams.page);
  const pageSize = 25;
  const [{ rows, total }, counts] = await Promise.all([listSources(db, { status, page, pageSize }), statusCounts(db)]);
  const all = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  const config = autopilotConfig();
  const limits = budgetLimitsFromEnv();
  const processed = rows.filter((r) => r.cost_usd_micros > 0);
  const avg = processed.length ? Math.round(processed.reduce((n, r) => n + r.cost_usd_micros, 0) / processed.length) : 0;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="אוטופיילוט תוכן"
        description="סרטונים חדשים מהערוץ: תמלול, סיכום, פרקים וחיפוש באופן אוטומטי. אתם רק מאשרים ומפרסמים."
        actions={all > 0 ? <CheckChannelButton /> : undefined}
      />

      {all === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="סיכום התור">
            <SummaryCard label="מוכנים לפרסום" value={counts.indexed ?? 0} href="/admin/autopilot/?status=indexed" tone="text-warning-600" />
            <SummaryCard
              label="דורשים טיפול"
              value={(counts.needs_transcript ?? 0) + (counts.failed ?? 0)}
              href={`/admin/autopilot/?status=${(counts.needs_transcript ?? 0) > 0 ? 'needs_transcript' : 'failed'}`}
              tone="text-danger-600"
            />
            <SummaryCard label="חדשים בתור" value={(counts.detected ?? 0) + (counts.transcribed ?? 0)} href="/admin/autopilot/?status=detected" tone="text-primary" />
            <SummaryCard label="פורסמו באתר" value={counts.published ?? 0} href="/admin/autopilot/?status=published" />
          </section>

          <nav aria-label="סינון לפי סטטוס" className="flex flex-wrap gap-2">
            <Link
              href="/admin/autopilot/"
              aria-current={!status ? 'page' : undefined}
              className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${!status ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'}`}
            >
              הכול ({all})
            </Link>
            {SOURCE_STATUSES.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
              <Link
                key={s}
                href={`/admin/autopilot/?status=${s}`}
                aria-current={status === s ? 'page' : undefined}
                className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${status === s ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'}`}
              >
                {STATUS_INFO[s].label} ({counts[s]})
              </Link>
            ))}
          </nav>

          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            caption="תור האוטופיילוט"
            empty="אין פריטים בסטטוס הזה."
            columns={[
              { key: 'title', header: 'סרטון', render: titleCell },
              { key: 'date', header: 'עלה', className: 'hidden md:table-cell whitespace-nowrap', render: (r) => formatDate(r.published_at) },
              {
                key: 'status',
                header: 'סטטוס',
                render: (r) => {
                  const st = effectiveStatus(r.status, r.updated_at);
                  return (
                    <div className="max-w-[14rem]">
                      <StatusBadge label={STATUS_INFO[st].label} tone={STATUS_INFO[st].tone} />
                      {r.error && (st === 'failed' || st === 'needs_transcript') && (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500" title={r.error}>
                          {r.error.replace(/\s*\[[a-z_]+\]$/, '')}
                        </p>
                      )}
                    </div>
                  );
                },
              },
              { key: 'chunks', header: 'מקטעים', className: 'hidden lg:table-cell text-center', render: (r) => (r.chunk_count ? r.chunk_count : '—') },
              {
                key: 'cost',
                header: 'עלות',
                className: 'hidden lg:table-cell whitespace-nowrap',
                render: (r) => <span dir="ltr">{r.cost_usd_micros ? formatUsd(r.cost_usd_micros) : '—'}</span>,
              },
              {
                key: 'actions',
                header: <span className="sr-only">פעולות</span>,
                render: (r) => <SourceActions id={r.id} status={r.status} updatedAt={r.updated_at} title={r.title} />,
              },
            ]}
          />
          <AdminPagination basePath="/admin/autopilot/" params={{ status: status ?? undefined }} page={page} pageSize={pageSize} total={total} />
        </>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-card" aria-label="הגדרות">
        <h2 className="mb-2 text-base font-semibold text-gray-900">איך זה עובד</h2>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <li>בדיקה אוטומטית של הערוץ: כל יום ב-09:00 (שעון ישראל).</li>
          <li>עיבוד אוטומטי של סרטונים חדשים: {config.autoProcess ? `פעיל (עד ${config.autoProcessLimit} ביום)` : 'כבוי, העיבוד ידני'}.</li>
          <li>פיד פודקאסט: {config.podcastRssUrl ? 'מוגדר' : 'לא מוגדר'}.</li>
          <li>
            תקרת עלות: <span dir="ltr">{formatUsd(limits.perVideoMicros)}</span> לסרטון, <span dir="ltr">{formatUsd(limits.monthlyMicros)}</span> ל-30 יום.
          </li>
          {avg > 0 && (
            <li>
              עלות ממוצעת לסרטון בעמוד הזה: <span dir="ltr">{formatUsd(avg)}</span>.
            </li>
          )}
          <li>פרסום תמיד באישור שלכם: שום סרטון לא עולה לאתר בלי לחיצה על &quot;פרסום&quot;.</li>
        </ul>
      </section>
    </div>
  );
}
