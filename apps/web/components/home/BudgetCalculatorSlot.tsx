import Link from 'next/link';
import { ArrowLeft, Check, FileUp } from 'lucide-react';
import { BUDGET_TEASER, PLAN_BUDGET_OFFER } from '@/lib/home/content';
import { calculateCost } from '@/lib/calculator';
import { cn } from '@/lib/cn';
import type { PriceBook } from '@/lib/planner/types';
import PlanBudgetRequest from './PlanBudgetRequest';

/** "₪1,724,310" -> "1.72"; millions with two decimals. */
function millions(n: number): string {
  return (n / 1_000_000).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface BudgetCalculatorSlotProps {
  /** The owner's current price book (the page loads it); the seeded book otherwise. */
  book?: PriceBook;
  className?: string;
}

/**
 * The homepage's first paid offer: upload the plans, get a budget from them
 * at current field prices, with access to the project-management system
 * (₪500, copy in lib/home/content.ts). Beside it, a real example run through
 * the site's calculator (lib/calculator.ts, on the planner engine and the
 * current price book), dated, and the way to the free calculator.
 */
export default function BudgetCalculatorSlot({ book, className }: BudgetCalculatorSlotProps) {
  const offer = PLAN_BUDGET_OFFER;
  const at = offer.title.indexOf(offer.highlight);
  const example = calculateCost({ ...BUDGET_TEASER.example.answers, special_features: [...BUDGET_TEASER.example.answers.special_features] }, book);
  const top = [...example.breakdown].sort((a, b) => b.percentage - a.percentage).slice(0, 4);
  const max = top[0]?.percentage ?? 1;

  return (
    <section aria-labelledby="budget-title" className={cn('pb-14 pt-2 sm:pb-20', className)}>
      <div className="container-page">
        <div className="grid items-center gap-10 rounded-[2rem] border border-sand-200 bg-sand-50 p-6 sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-12">
          <div>
            <p className="eyebrow">
              <FileUp aria-hidden="true" className="size-4" />
              {offer.eyebrow}
            </p>
            <h2 id="budget-title" className="mt-3 text-headline text-ink-900">
              {at < 0 ? (
                offer.title
              ) : (
                <>
                  {offer.title.slice(0, at)}
                  <span className="text-primary-600">{offer.highlight}</span>
                  {offer.title.slice(at + offer.highlight.length)}
                </>
              )}
            </h2>
            <p className="mt-3 text-body-lg text-ink-600">{offer.subtitle}</p>
            <ul className="mt-6 space-y-3">
              {offer.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-ink-800">
                  <span aria-hidden="true" className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="font-medium">{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-7 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num text-4xl font-extrabold tracking-tight text-ink-900">{offer.price}</span>
              <span className="text-sm font-semibold text-ink-600">{offer.priceNote}</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <PlanBudgetRequest />
              <p className="text-sm text-ink-600">
                {offer.freeLead}{' '}
                <Link href={offer.freeHref} className="link inline-flex items-center gap-1">
                  {offer.freeCta}
                  <ArrowLeft aria-hidden="true" className="size-3.5 ltr:rotate-180" />
                </Link>
              </p>
            </div>
          </div>

          <figure className="rounded-3xl bg-white p-5 shadow-lift ring-1 ring-ink-900/5 sm:p-7">
            <figcaption className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-ink-900">הערכה לדוגמה</span>
              <span className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-sand-800">{BUDGET_TEASER.asOf}</span>
            </figcaption>
            <p className="mt-1 text-sm text-ink-500">{BUDGET_TEASER.example.label}</p>
            <p className="mt-5 flex items-baseline gap-2 text-ink-900">
              <span className="num text-4xl font-extrabold tracking-tight sm:text-5xl">
                ₪{millions(example.total_min)}–{millions(example.total_max)}
              </span>
              <span className="text-lg font-bold">מיליון</span>
            </p>
            <p className="mt-1 text-xs text-ink-500">לא כולל קרקע ומע״מ. טווח של ±15%.</p>
            <ul className="mt-6 space-y-3.5" aria-label="פירוק לפי שלבים">
              {top.map((b) => (
                <li key={b.phase}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-800">{b.label}</span>
                    <span className="num font-semibold text-ink-900">{b.percentage}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-primary-600" style={{ width: `${(b.percentage / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </figure>
        </div>
      </div>
    </section>
  );
}
