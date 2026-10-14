import { ArrowLeft, Calculator, Clock3 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { BUDGET_TEASER } from '@/lib/home/content';
import { calculateCost } from '@/lib/calculator';
import { cn } from '@/lib/cn';

/** "₪1,724,310" -> "1.72"; millions with two decimals. */
function millions(n: number): string {
  return (n / 1_000_000).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface BudgetCalculatorSlotProps {
  title?: string;
  subtitle?: string;
  cta?: string;
  /** Today /calculator/; the growth squad (Wave B) can point it at the planner. */
  href?: string;
  className?: string;
}

/**
 * "מחשבון תקציב" slot: a real example run through the site's calculator
 * (lib/calculator.ts), dated, plus the way in.
 */
export default function BudgetCalculatorSlot({
  title = BUDGET_TEASER.title,
  subtitle = BUDGET_TEASER.subtitle,
  cta = BUDGET_TEASER.cta,
  href = BUDGET_TEASER.href,
  className,
}: BudgetCalculatorSlotProps) {
  const example = calculateCost({ ...BUDGET_TEASER.example.answers, special_features: [...BUDGET_TEASER.example.answers.special_features] });
  const top = [...example.breakdown].sort((a, b) => b.percentage - a.percentage).slice(0, 4);
  const max = top[0]?.percentage ?? 1;

  return (
    <section aria-labelledby="budget-title" className={cn('pb-14 pt-2 sm:pb-20', className)}>
      <div className="container-page">
        <div className="grid items-center gap-10 rounded-[2rem] border border-sand-200 bg-sand-50 p-6 sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-12">
          <div>
            <p className="eyebrow">
              <Calculator aria-hidden="true" className="size-4" />
              מחשבון תקציב
            </p>
            <h2 id="budget-title" className="mt-3 text-headline text-ink-900">
              {title}
            </h2>
            <p className="mt-3 text-body-lg text-ink-600">{subtitle}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-ink-600">
              <Clock3 aria-hidden="true" className="size-4 text-primary-600" />
              בלי הרשמה. התוצאה מיד, עם פירוק לפי שלבים.
            </p>
            <div className="mt-8">
              <ButtonLink href={href} size="lg" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
                {cta}
              </ButtonLink>
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
