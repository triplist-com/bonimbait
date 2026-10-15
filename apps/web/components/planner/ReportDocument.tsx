import type { ReactNode } from 'react';
import { CalendarCheck, Phone } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { BUILD_STAGES } from '@/lib/stages';
import { CONTACT_DETAILS } from '@/lib/brand';
import { absoluteUrl } from '@/lib/site';
import { EXTRAS, FINISH_LEVELS, FLOOR_LABELS, regionName } from '@/lib/planner/content';
import { asOfBadge, formatShekels, isolateRanges, monthYear, monthYearAfter, perM2Text, rangeText } from '@/lib/planner/format';
import { plannerHref } from '@/lib/planner/share';
import type { PlannerEstimate, PriceBook } from '@/lib/planner/types';
import { NotIncluded } from './NotIncluded';
import { OverrunWarnings } from './OverrunWarnings';
import { PlannerTimeline } from './PlannerTimeline';
import { SourcesList } from './SourcesList';

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    // Sections may break across pages; their cards and rows may not, and a heading never ends a page.
    <section aria-labelledby={id} className="mt-8 print:mt-6">
      <h2 id={id} className="mb-3 break-after-avoid border-b-2 border-primary-600 pb-1.5 text-title-lg text-ink-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The printable estimate (A4): the owner's brand, the answers, the range, the
 * 7 stages, what is left out, a timeline, three overrun warnings with their
 * podcast links, the assumptions and the sources, dated. Server component.
 */
export function ReportDocument({ estimate, book, issuedAt }: { estimate: PlannerEstimate; book: PriceBook; issuedAt: Date }) {
  const { input } = estimate;
  const issued = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }).format(issuedAt);
  const keys: [string, string] = [monthYearAfter(issuedAt, estimate.totalMonths[0]), monthYearAfter(issuedAt, estimate.totalMonths[1])];
  const answers: Array<[string, string]> = [
    ['שטח', `${input.sizeM2} מ״ר (אדריכלי)`],
    ['קומות', FLOOR_LABELS[input.floors].label],
    ['אזור', regionName(input.regionSlug)],
    ['רמת גמר', FINISH_LEVELS[input.finishLevel].label],
    ['תוספות', input.extras.length ? input.extras.map((e) => EXTRAS[e].label).join(', ') : 'אין'],
  ];
  const assumptions: string[] = [
    `±${estimate.rangePct}% סביב הממוצע: ${book.finishLevels[input.finishLevel].note}`,
    `קומות: ${book.notes.floors}`,
    `חלוקה לשלבים: ${book.notes.split}`,
    `אזור: ${book.regionNotes[input.regionSlug] ?? book.notes.regions}`,
    ...input.extras.map((e) => `${EXTRAS[e].label}: ${book.extras[e].note}`),
    `לוח זמנים: ${book.notes.timeline}`,
    `בלת״מים: ${book.contingencyPct.note}`,
  ];

  return (
    <article id="planner-report" className="report-sheet mx-auto max-w-[210mm] bg-white p-6 text-ink-900 shadow-card sm:p-10 print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-100 pb-5">
        <div>
          <Logo accent className="h-10 text-ink-900" />
          <p className="mt-2 text-sm text-ink-600">אתכם עד המפתח</p>
        </div>
        <div className="text-end text-sm text-ink-600">
          <h1 className="text-title text-ink-900">הערכת תקציב ראשונית</h1>
          <p>
            הופק ב-<time dateTime={issuedAt.toISOString()}>{issued}</time>
          </p>
          <p>
            מספר הערכה <span className="num font-semibold text-ink-800">{estimate.estimateId}</span>
          </p>
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-800">
            <CalendarCheck aria-hidden="true" className="size-3.5" />
            {asOfBadge(estimate.validAsOf)} · מחירון {monthYear(estimate.validAsOf)}
          </p>
        </div>
      </header>

      <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] print:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="report-house">
          <h2 id="report-house" className="mb-2 text-title text-ink-900">
            הבית
          </h2>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5 text-body-sm">
            {answers.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-600">{k}</dt>
                <dd className="font-semibold text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="report-total" className="rounded-2xl bg-sand-50 p-5 ring-1 ring-sand-200 print:ring-sand-300">
          <h2 id="report-total" className="text-sm font-bold text-primary-700">
            תכנון ובנייה, לפני מע״מ
          </h2>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-ink-900">
            {rangeText(estimate.total)}
          </p>
          <p className="mt-1 text-body-sm text-ink-700">
            {perM2Text(estimate.perM2)} · כולל מע״מ {estimate.vatRatePct}%: <span className="font-semibold">{rangeText(estimate.totalWithVat)}</span>
          </p>
          <p className="mt-2 text-caption text-ink-600">בלי מגרש ובלי אכלוס. טווח של ±{estimate.rangePct}% סביב הממוצע של מאות תקציבי בנייה.</p>
        </section>
      </div>

      <Section title="לפי 7 שלבי הבנייה" id="report-stages">
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-ink-200 text-start text-ink-600">
              <th scope="col" className="py-2 text-start font-semibold">שלב</th>
              <th scope="col" className="py-2 text-start font-semibold">טווח</th>
              <th scope="col" className="w-16 py-2 text-end font-semibold">חלק</th>
            </tr>
          </thead>
          <tbody>
            {estimate.stages.map((s) => {
              const stage = BUILD_STAGES.find((b) => b.id === s.id)!;
              return (
                <tr key={s.id} className="break-inside-avoid border-b border-ink-100 align-top">
                  <th scope="row" className="py-2 text-start font-semibold text-ink-900">
                    <span className="num me-1 text-ink-500">{stage.order}.</span>
                    {stage.label}
                    {s.extras.length > 0 && <span className="block text-caption font-normal text-ink-600">כולל {s.extras.map((e) => EXTRAS[e].label).join(', ')}</span>}
                  </th>
                  <td className="py-2 text-ink-800">
                    {s.included ? (
                      <span className="num">
                        {formatShekels(s.min)}–{formatShekels(s.max)}
                      </span>
                    ) : s.id === 'purchase' ? (
                      isolateRanges('לא כלול: תלוי במגרש (מס רכישה 5%-6%)')
                    ) : (
                      <>
                        לא כלול: {rangeText(estimate.movingIn)} לריהוט ולמכשירים
                      </>
                    )}
                  </td>
                  <td className="num py-2 text-end font-semibold text-ink-900">{s.included ? `${s.sharePct}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="מה לא נכנס לסכום" id="report-outside">
        <NotIncluded estimate={estimate} book={book} />
      </Section>

      <Section title="לוח זמנים משוער" id="report-timeline">
        <PlannerTimeline estimate={estimate} keysBetween={keys} />
      </Section>

      <Section title="פה הכי קל לחרוג" id="report-overruns">
        <OverrunWarnings estimate={estimate} print />
      </Section>

      <Section title="הנחות היסוד" id="report-assumptions">
        <ul className="list-disc space-y-1.5 ps-5 text-body-sm text-ink-700 marker:text-primary-600">
          {assumptions.map((a) => (
            <li key={a}>{isolateRanges(a)}</li>
          ))}
        </ul>
      </Section>

      <Section title="מקורות" id="report-sources">
        <SourcesList book={book} print all />
      </Section>

      <footer className="mt-10 break-inside-avoid rounded-2xl bg-ink-950 p-6 text-white print:mt-8">
        <p className="text-title-lg">
          רוצים דיוק של <span className="num whitespace-nowrap">3%–5%</span>?
        </p>
        <p className="mt-1 text-body-sm text-white/80">
          ההערכה הזו אינה הצעת מחיר. בפגישת ייעוץ תקציב, ללא עלות, נבנה איתכם תקציב מפורט של 360 סעיפים לפי התוכניות שלכם.
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Phone aria-hidden="true" className="size-4 text-primary-300" />
            <a href={`tel:${CONTACT_DETAILS.phone.replace(/\D/g, '')}`} dir="ltr" className="num font-semibold">
              {CONTACT_DETAILS.phone}
            </a>
          </span>
          <span dir="ltr" className="break-all text-white/80">
            {absoluteUrl(plannerHref(input))}
          </span>
        </p>
      </footer>
    </article>
  );
}
