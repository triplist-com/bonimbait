'use client';

/**
 * The planner result: an honest range (dated, sourced), where the money goes
 * by the owner's 7 stages, a rough timeline, three "פה הכי קל לחרוג" moments,
 * and the way forward: the free budget consultation ("דיוק של 3%-5%"), the
 * בונים תקציב plan, save to "הבית שלי", WhatsApp and the printable report.
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, FileDown, Home, Pencil, RotateCcw } from 'lucide-react';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Choice';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';
import { asOfBadge, isolateRanges, monthYearAfter, rangeText } from '@/lib/planner/format';
import { BUDGET_PLAN_HREF, MY_HOME_HREF, reportHref, whatsappShareHref } from '@/lib/planner/share';
import { plannerSnapshot, writePlannerLast } from '@/lib/planner/storage';
import type { HubDraft, PlannerEstimate, PriceBook } from '@/lib/planner/types';
import { EstimateSummary, answerLabels } from './EstimateSummary';
import { NotIncluded } from './NotIncluded';
import { OverrunWarnings } from './OverrunWarnings';
import { PlannerTimeline } from './PlannerTimeline';
import { SourcesList } from './SourcesList';
import { StageBreakdown } from './StageBreakdown';

export interface PlannerResultProps {
  book: PriceBook;
  estimate: PlannerEstimate;
  hubDraft?: HubDraft | null;
  /** Go back to a question (0-4) to change an answer. */
  onEdit?: (step: number) => void;
  onRestart?: () => void;
  /** Where the consultation CTA is attributed (Calendly utm_source). */
  ctaSource?: string;
  /** Today, for "keys between …" (the demo pins it). */
  today?: Date;
  /** Write bb.planner.last on save (off in the demo). */
  persist?: boolean;
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.56.93.95-3.47-.22-.36A9.4 9.4 0 0 1 2.63 12C2.63 6.8 6.86 2.58 12.06 2.58c2.52 0 4.88.98 6.66 2.76a9.35 9.35 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.43 9.43m8.02-17.45A11.27 11.27 0 0 0 12.05.72C5.8.72.72 5.8.72 12.04c0 2 .52 3.94 1.51 5.66L.62 23.28l5.71-1.5a11.3 11.3 0 0 0 5.72 1.46h.01c6.24 0 11.32-5.08 11.33-11.32a11.26 11.26 0 0 0-3.32-8.01" />
    </svg>
  );
}

function SectionTitle({ id, eyebrow, children }: { id: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h2 id={id} className="text-headline-sm text-ink-900">
        {children}
      </h2>
    </div>
  );
}

/** Compare the estimate with the budget the builder set in the hub onboarding. */
function budgetVerdict(estimate: PlannerEstimate, budget: [number, number]): string {
  if (estimate.total.min > budget[1]) return 'ההערכה גבוהה מהתקציב שהגדרתם. בפגישת הייעוץ נראה איפה אפשר לחסוך בלי לוותר על מה שחשוב.';
  if (estimate.total.max < budget[0]) return 'ההערכה נמוכה מהתקציב שהגדרתם: יש לכם מרווח, וכדאי לשמור עליו לבלת״מים.';
  return 'ההערכה בתוך התקציב שהגדרתם. הטווח עדיין רחב: בתקציב מפורט מצמצמים אותו ל-3%-5%.';
}

export default function PlannerResult({ book, estimate, hubDraft, onEdit, onRestart, ctaSource = 'planner-result', today, persist = true }: PlannerResultProps) {
  const [withVat, setWithVat] = useState(false);
  const [saved, setSaved] = useState(false);
  const { input } = estimate;
  const keysBetween = useMemo<[string, string]>(() => {
    const from = today ?? new Date();
    return [monthYearAfter(from, estimate.totalMonths[0]), monthYearAfter(from, estimate.totalMonths[1])];
  }, [today, estimate.totalMonths]);
  const regionNote = book.regionNotes[input.regionSlug];
  const answers = answerLabels(estimate);
  const ctaEvent = (cta: string) => () => track('lead_cta_clicked', { cta, placement: 'planner_result' });

  const saveToHome = () => {
    if (persist) writePlannerLast(plannerSnapshot(estimate));
    setSaved(true);
    track('hub_item_saved', { item_type: 'planner_estimate', item_id: estimate.estimateId });
  };

  return (
    <div className="space-y-12 sm:space-y-16" data-planner-result>
      {/* Summary + next step */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <EstimateSummary
          estimate={estimate}
          headingId="planner-total"
          withVat={withVat}
          controls={
            <Switch
              checked={withVat}
              onChange={(e) => setWithVat(e.target.checked)}
              label={<span className="text-white">הציגו כולל מע״מ</span>}
              className="mt-5"
            />
          }
          chips={
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="התשובות שלכם">
              {answers.map((a) => (
                <li key={a.step}>
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(a.step)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 text-sm text-white/90 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      aria-label={`שינוי: ${a.label}`}
                    >
                      {a.label}
                      <Pencil aria-hidden="true" className="size-3.5 opacity-70" />
                    </button>
                  ) : (
                    <span className="inline-flex h-9 items-center rounded-full border border-white/20 bg-white/5 px-3.5 text-sm text-white/90">{a.label}</span>
                  )}
                </li>
              ))}
            </ul>
          }
        >
          {regionNote && <p className="mt-4 text-body-sm text-white/75">{regionNote}</p>}
          {hubDraft?.budgetRangeNis && (
            <p className="mt-4 rounded-2xl bg-white/10 p-4 text-body-sm text-white/85">
              <strong className="text-white">התקציב שהגדרתם בבית שלי: {rangeText({ min: hubDraft.budgetRangeNis[0], max: hubDraft.budgetRangeNis[1] })}.</strong>{' '}
              {isolateRanges(budgetVerdict(estimate, hubDraft.budgetRangeNis))}
            </p>
          )}
        </EstimateSummary>

        <aside data-floating-cta="hide" aria-labelledby="planner-next" className="rounded-4xl border border-sand-200 bg-sand-50 p-6 shadow-card sm:p-7">
          <p className="eyebrow">הצעד הבא</p>
          <h2 id="planner-next" className="mt-2 text-title-lg text-ink-900">
            רוצים דיוק של <span className="num whitespace-nowrap">3%–5%</span>?
          </h2>
          <p className="mt-2 text-body-sm text-ink-600">
            בפגישת ייעוץ תקציב עוברים על התוכניות שלכם, סעיף אחרי סעיף, ומבינים איפה הכסף באמת הולך. ללא עלות וללא התחייבות.
          </p>
          <div className="mt-5 space-y-3">
            <ConsultationCTA source={ctaSource} label="קבעו פגישת ייעוץ תקציב — ללא עלות" fullWidth size="lg" />
            <ButtonLink href={BUDGET_PLAN_HREF} variant="outline" size="lg" fullWidth onClick={ctaEvent('budget_plan')} iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
              לתוכנית בונים תקציב
            </ButtonLink>
            <p className="text-caption text-ink-600">
              תקציב מפורט של 360 סעיפים, מבוסס כמויות: סטייה של <span className="num whitespace-nowrap">3%–5%</span> ממחירי השוק.
            </p>
          </div>
          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2 border-t border-sand-200 pt-5">
            <ButtonLink href={MY_HOME_HREF} variant="secondary" onClick={saveToHome} iconStart={<Home />}>
              שמרו בבית שלי
            </ButtonLink>
            <a
              href={whatsappShareHref(estimate)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('planner_shared', { channel: 'whatsapp', placement: 'planner_result', estimate_id: estimate.estimateId })}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-whatsapp px-3 text-[0.9375rem] font-semibold text-ink-950 transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
            >
              <WhatsAppGlyph />
              שתפו בוואטסאפ
            </a>
          </div>
          <p aria-live="polite" className={cn('mt-2 text-caption text-ink-600', !saved && 'sr-only')}>
            {saved ? 'התקציב נשמר. הוא יחכה לכם בבית שלי.' : ''}
          </p>
          <ButtonLink
            href={reportHref(input)}
            variant="link"
            className="mt-3"
            onClick={ctaEvent('budget_report')}
            iconStart={<FileDown />}
          >
            לדוח המלא להדפסה ול-PDF
          </ButtonLink>
        </aside>
      </div>

      <section aria-labelledby="planner-stages">
        <SectionTitle id="planner-stages" eyebrow="לפי 7 השלבים">
          לאן הולך הכסף
        </SectionTitle>
        <div className="rounded-3xl border border-ink-100 bg-white px-5 shadow-card sm:px-7">
          <StageBreakdown estimate={estimate} headingId="planner-stages" />
        </div>
      </section>

      <section aria-labelledby="planner-outside">
        <SectionTitle id="planner-outside" eyebrow="התמונה המלאה">
          מה לא נכנס לסכום
        </SectionTitle>
        <NotIncluded estimate={estimate} book={book} />
      </section>

      <section aria-labelledby="planner-timeline">
        <SectionTitle id="planner-timeline" eyebrow="לוח זמנים משוער">
          <span className="inline-flex items-center gap-2">
            <CalendarRange aria-hidden="true" className="size-6 text-primary-600" />
            כמה זמן זה לוקח
          </span>
        </SectionTitle>
        <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
          <PlannerTimeline estimate={estimate} keysBetween={keysBetween} />
        </div>
      </section>

      <section aria-labelledby="planner-overruns">
        <SectionTitle id="planner-overruns" eyebrow="מהשטח">
          פה הכי קל לחרוג
        </SectionTitle>
        <p className="-mt-2 mb-5 max-w-2xl text-body text-ink-600">שלושה מקומות שבהם תקציב כמו שלכם בורח הכי מהר. כל אחד עם הרגע המדויק בפודקאסט שבו תומר וצורי מסבירים אותו.</p>
        <OverrunWarnings estimate={estimate} />
      </section>

      <section aria-labelledby="planner-sources" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <SectionTitle id="planner-sources" eyebrow={asOfBadge(estimate.validAsOf)}>
            מאיפה המספרים
          </SectionTitle>
          <p className="mb-5 text-body text-ink-600">
            מאות תקציבי בנייה שערכנו בבונים בית, והמספרים שתומר וצורי פרסמו ב-2026. כמו שצורי אומר, עלות למטר היא מספר עוגן ולא יותר. לכן אתם מקבלים טווח, ולא מספר אחד.
          </p>
          <SourcesList book={book} />
        </div>
        <div className="flex flex-col gap-3 rounded-3xl border border-ink-100 bg-white p-6 shadow-card lg:self-start">
          <h3 className="text-title text-ink-900">רוצים לשנות משהו?</h3>
          <p className="text-body-sm text-ink-600">כל שינוי בתשובות מחשב מחדש את כל הדוח.</p>
          <div className="flex flex-wrap gap-2">
            {onEdit && (
              <Button variant="outline" onClick={() => onEdit(0)} iconStart={<Pencil />}>
                עריכת התשובות
              </Button>
            )}
            {onRestart && (
              <Button variant="ghost" onClick={onRestart} iconStart={<RotateCcw />}>
                מתחילים מחדש
              </Button>
            )}
          </div>
        </div>
      </section>

      <ConsultationCTA
        variant="banner"
        source={`${ctaSource}-band`}
        title="רוצים לדעת בדיוק כמה הבית שלכם יעלה?"
        description={isolateRanges('תקציב מפורט של 360 סעיפים, מבוסס כמויות, עם סטייה של 3%-5% ממחירי השוק. מתחילים בפגישת ייעוץ תקציב, ללא עלות.')}
        label="קבעו פגישת ייעוץ תקציב — ללא עלות"
      />
    </div>
  );
}
