import type { ReactNode } from 'react';
import { EXTRAS, FINISH_LEVELS, FLOOR_LABELS, regionName } from '@/lib/planner/content';
import { asOfBadge, monthYear, perM2Text } from '@/lib/planner/format';
import type { MoneyRange, PlannerEstimate } from '@/lib/planner/types';
import { cn } from '@/lib/cn';
import { Money } from './Money';

/** The answers as short labels, in question order (step = the question index). */
export function answerLabels(estimate: PlannerEstimate): Array<{ label: string; step: number }> {
  const { input } = estimate;
  return [
    { label: `${input.sizeM2} מ״ר`, step: 0 },
    { label: FLOOR_LABELS[input.floors].label, step: 1 },
    { label: regionName(input.regionSlug), step: 2 },
    { label: `גמר ${FINISH_LEVELS[input.finishLevel].label}`, step: 3 },
    { label: input.extras.length ? input.extras.map((e) => EXTRAS[e].label).join(', ') : 'בלי תוספות', step: 4 },
  ];
}

/**
 * The headline card of an estimate: the range, ₪/m², the answers and the date.
 * Server-safe; the interactive result passes a VAT switch and editable chips.
 */
export function EstimateSummary({
  estimate,
  headingId,
  label = 'התקציב הראשוני שלכם',
  withVat = false,
  controls,
  chips,
  children,
  className,
}: {
  estimate: PlannerEstimate;
  headingId: string;
  label?: string;
  withVat?: boolean;
  /** Under the price line (e.g. the VAT switch). */
  controls?: ReactNode;
  /** Replaces the default answer chips (e.g. editable ones). */
  chips?: ReactNode;
  /** After the chips (notes, budget comparison). */
  children?: ReactNode;
  className?: string;
}) {
  const total: MoneyRange = withVat ? estimate.totalWithVat : estimate.total;
  const factor = withVat ? 1 + estimate.vatRatePct / 100 : 1;
  const perM2 = { min: Math.round((estimate.perM2.min * factor) / 100) * 100, max: Math.round((estimate.perM2.max * factor) / 100) * 100 };

  return (
    <section aria-labelledby={headingId} className={cn('relative isolate overflow-hidden rounded-4xl bg-ink-950 p-6 text-white shadow-lift sm:p-10', className)}>
      <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10 opacity-50" />
      <span aria-hidden="true" className="absolute -start-24 -top-28 -z-10 size-80 rounded-full bg-primary-600/35 blur-3xl" />
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-primary-300">
        <span>{label}</span>
        <span aria-hidden="true">·</span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white">{asOfBadge(estimate.validAsOf)}</span>
      </p>
      <h2 id={headingId} className="mt-3">
        <span className="sr-only">טווח העלות המשוער: </span>
        <Money min={total.min} max={total.max} valueClassName="text-5xl font-extrabold tracking-tight sm:text-7xl" unitClassName="text-2xl font-bold sm:text-3xl" />
      </h2>
      <p className="mt-2 text-body text-white/75">
        לתכנון ובנייה, {withVat ? `כולל מע״מ ${estimate.vatRatePct}%` : 'לפני מע״מ'} · <span>{perM2Text(perM2)}</span>
      </p>
      {controls}
      {chips ?? (
        <ul className="mt-6 flex flex-wrap gap-2" aria-label="פרטי הבית">
          {answerLabels(estimate).map((a) => (
            <li key={a.step} className="inline-flex h-9 items-center rounded-full border border-white/20 bg-white/5 px-3.5 text-sm text-white/90">
              {a.label}
            </li>
          ))}
        </ul>
      )}
      {children}
      <p className="mt-6 border-t border-white/10 pt-4 text-sm text-white/65">
        טווח של ±{estimate.rangePct}% סביב הממוצע שאנחנו רואים במאות תקציבים. בלי מגרש ובלי אכלוס. המחירון עודכן ב{monthYear(estimate.validAsOf)}.
      </p>
    </section>
  );
}
