import { ChevronDown, CircleCheck, Coins, Info, TriangleAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { budgetGap, plannedFromEstimate, summarizeBudget, varianceStatus, type CategorySummary } from '@/lib/hub/budget';
import { buildStage } from '@/lib/hub/content';
import { formatMoney } from '@/lib/hub/format';
import type { HubViewData } from '@/lib/hub/types';
import { cn } from '@/lib/cn';
import { BudgetAddButton, BudgetItemList, PlannerRebasePrompt } from './BudgetControls';
import { Money, MoneyRange, Variance } from './Money';
import { HubSection, SignupPrompt } from './parts';

const BASIS_LABEL = {
  calculator: 'לפי מחשבון בונים בית',
  planner: 'לפי מתכנן התקציב שלכם',
  manual: 'תקציב שעדכנתם',
  quotes: 'לפי הצעות המחיר',
} as const;

/**
 * Budget: the first estimate (calculator, or growth's planner result), then
 * quotes and payments by category against it. Members record items; local
 * visitors see the estimate split and a reason to sign up. Server-safe shell.
 */
export function BudgetPanel({ data }: { data: HubViewData }) {
  const { estimate, budgetVersion, budgetItems, project } = data;
  const local = data.mode === 'local';
  const planned = budgetVersion?.planned && Object.keys(budgetVersion.planned).length
    ? budgetVersion.planned
    : estimate
      ? plannedFromEstimate(estimate.totalMin, estimate.totalMax)
      : {};
  const summary = summarizeBudget(planned, budgetItems);
  const gap = budgetGap(project.budgetRangeNis, estimate);
  const rows = summary.categories.filter((c) => c.planned > 0 || c.forecastBasis !== 'plan');

  return (
    <HubSection
      id="budget"
      icon={<Coins />}
      title="התקציב"
      subtitle={
        estimate ? (
          <>
            {BASIS_LABEL[budgetVersion?.basis ?? estimate.basis]}
            {budgetVersion && budgetVersion.versionNo > 1 && (
              <>
                {' '}
                · גרסה <span className="num">{budgetVersion.versionNo}</span>
              </>
            )}
            . נכון ל-2026, לא כולל מחיר המגרש.
          </>
        ) : (
          'הוסיפו את גודל הבית כדי לקבל הערכה ראשונית.'
        )
      }
      action={!local && estimate ? <BudgetAddButton /> : undefined}
    >
      {estimate && <PlannerRebasePrompt currentBasis={budgetVersion?.basis ?? estimate.basis} currentAt={estimate.at ?? null} />}

      {estimate && (
        <dl className={cn('grid gap-3', summary.hasData && 'sm:grid-cols-3')}>
          <Tile label="הערכה לבית שלכם">
            <MoneyRange min={estimate.totalMin} max={estimate.totalMax} />
          </Tile>
          {summary.hasData && (
            <>
              <Tile label="צפי עלות לפי מה שידוע" hint={<VarianceBadge value={summary.variance} status={statusOf(summary.variance, summary.planned)} />}>
                <Money value={summary.forecast} />
              </Tile>
              <Tile
                label="שולם עד היום"
                hint={
                  summary.actual > 0 ? (
                    <>
                      <span className="num">{Math.round(summary.paidShare * 100)}%</span> מהתכנון
                    </>
                  ) : (
                    'עוד לא נרשמו תשלומים'
                  )
                }
              >
                <Money value={summary.actual} />
              </Tile>
            </>
          )}
        </dl>
      )}

      {gap && gap.kind !== 'within' && project.budgetRangeNis && (
        <div
          className={cn(
            'mt-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between',
            gap.kind === 'below' ? 'bg-warning-50 text-warning-800' : 'bg-info-50 text-info-800',
          )}
        >
          <p className="flex items-start gap-2.5 text-body-sm">
            {gap.kind === 'below' ? (
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-700" />
            ) : (
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info-700" />
            )}
            <span>
              {gap.kind === 'below' ? (
                <>
                  התקציב שלכם נמוך מההערכה בכ-<Money value={gap.amount} />. זה בדיוק מה שבודקים בפגישת ייעוץ תקציב: איפה אפשר לחסוך בלי לוותר על
                  מה שחשוב.
                </>
              ) : (
                <>
                  התקציב שלכם גבוה מההערכה בכ-<Money value={gap.amount} />. מרווח טוב לחריגים ולתוספות, שתמיד מגיעים.
                </>
              )}
            </span>
          </p>
          {gap.kind === 'below' && (
            <ConsultationCTA source="hub-budget-gap" label="לפגישת ייעוץ תקציב" size="md" buttonVariant="secondary" showWhatsApp={false} />
          )}
        </div>
      )}
      {gap?.kind === 'within' && (
        <p className="mt-4 flex items-center gap-2 text-body-sm text-success-700">
          <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
          התקציב שלכם בטווח ההערכה.
        </p>
      )}

      {summary.hasData ? (
        <div className="mt-5">
          <h3 className="mb-2 text-title-sm text-ink-900">לפי קטגוריה</h3>
          <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
            {rows
              .filter((c) => c.forecastBasis !== 'plan')
              .map((c) => (
                <CategoryRow key={c.id} c={c} />
              ))}
          </ul>
          {rows.some((c) => c.forecastBasis === 'plan') && (
            <details className="group/rest mt-2 rounded-2xl border border-ink-100">
              <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-body-sm font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
                קטגוריות בלי הצעות עדיין (<span className="num">{rows.filter((c) => c.forecastBasis === 'plan').length}</span>)
                <ChevronDown aria-hidden="true" className="size-4 text-ink-500 transition-transform group-open/rest:rotate-180" />
              </summary>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {rows
                  .filter((c) => c.forecastBasis === 'plan')
                  .map((c) => (
                    <PlannedRow key={c.id} c={c} />
                  ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        estimate && (
          <div className="mt-5">
            <h3 className="mb-2 text-title-sm text-ink-900">איך ההערכה מתחלקת לאורך הבנייה</h3>
            <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
              {summary.byStage
                .filter((s) => s.stage && s.planned > 0)
                .map((s) => (
                  <li key={s.stage} className="flex items-center justify-between gap-3 px-3 py-2.5 text-body-sm">
                    <span className="font-semibold text-ink-900">{buildStage(s.stage!).label}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-caption text-ink-500">
                        <span className="num">{Math.round((s.planned / Math.max(1, summary.planned)) * 100)}%</span>
                      </span>
                      <Money value={s.planned} className="font-semibold text-ink-900" />
                    </span>
                  </li>
                ))}
            </ul>
            <details className="group/cats mt-2 rounded-2xl border border-ink-100">
              <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-body-sm font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
                פירוט לפי <span className="num">{rows.length}</span> קטגוריות
                <ChevronDown aria-hidden="true" className="size-4 text-ink-500 transition-transform group-open/cats:rotate-180" />
              </summary>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {rows.map((c) => (
                  <PlannedRow key={c.id} c={c} />
                ))}
              </ul>
            </details>
            <p className="mt-2 text-caption text-ink-500">חלוקה אופיינית של ההערכה לבית פרטי. הצעות ותשלומים שתרשמו מחליפים אותה במספרים שלכם.</p>
          </div>
        )
      )}

      {local ? (
        <SignupPrompt
          className="mt-5"
          title="עקבו אחרי הצעות מחיר ותשלומים מול ההערכה"
          description="הירשמו בחינם, רשמו כל הצעה וכל תשלום, ותראו בכל רגע איפה אתם עומדים מול התקציב."
        />
      ) : (
        <BudgetItemList items={budgetItems} />
      )}
    </HubSection>
  );
}

function statusOf(variance: number, planned: number): 'under' | 'on' | 'over' {
  const status = varianceStatus(variance, planned, true);
  return status === 'none' ? 'on' : status;
}

function Tile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper p-4 ring-1 ring-inset ring-ink-100">
      <dt className="text-caption font-semibold text-ink-600">{label}</dt>
      <dd className="mt-1 text-title-lg text-ink-900">{children}</dd>
      {hint && <dd className="mt-1 text-caption text-ink-600">{hint}</dd>}
    </div>
  );
}

function VarianceBadge({ value, status }: { value: number; status: 'under' | 'on' | 'over' }) {
  if (status === 'on') {
    return (
      <Badge tone="success" icon={<CircleCheck />}>
        בתכנון
      </Badge>
    );
  }
  return (
    <Badge tone={status === 'over' ? 'warning' : 'success'} icon={status === 'over' ? <TrendingUp /> : <TrendingDown />}>
      <Variance value={value} /> {status === 'over' ? 'מעל התכנון' : 'מתחת לתכנון'}
    </Badge>
  );
}

const BASIS_NOTE: Record<CategorySummary['forecastBasis'], string> = {
  actual: 'לפי תשלומים',
  committed: 'לפי הצעה שנבחרה',
  quote: 'לפי ההצעה הזולה',
  plan: '',
};

function PlannedRow({ c }: { c: CategorySummary }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-3 py-2 text-body-sm">
      <span className="min-w-0 text-ink-800">{c.label}</span>
      <Money value={c.planned} className="shrink-0 text-ink-900" />
    </li>
  );
}

function CategoryRow({ c }: { c: CategorySummary }) {
  const max = Math.max(c.planned, c.forecast, 1);
  const hasData = c.forecastBasis !== 'plan';
  return (
    <li className="p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-body-sm font-semibold text-ink-900">
          {c.label}
          {c.stage && <span className="ms-2 text-caption font-normal text-ink-500">{buildStage(c.stage).label}</span>}
        </p>
        {hasData ? (
          <VarianceBadge value={c.variance} status={c.status === 'none' ? 'on' : c.status} />
        ) : (
          <span className="text-caption text-ink-500">עוד אין הצעות</span>
        )}
      </div>
      <div className="mt-2 space-y-1" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-ink-300" style={{ width: `${(c.planned / max) * 100}%` }} />
        </div>
        {hasData && (
          <div className="h-1.5 rounded-full bg-ink-100">
            <div
              className={cn('h-full rounded-full', c.status === 'over' ? 'bg-warning-500' : 'bg-primary-600')}
              style={{ width: `${(c.forecast / max) * 100}%` }}
            />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-caption text-ink-600">
        מתוכנן {formatMoney(c.planned)}
        {hasData && (
          <>
            {' '}
            · צפי {formatMoney(c.forecast)} ({BASIS_NOTE[c.forecastBasis]}
            {c.openQuotes > 1 && c.forecastBasis === 'quote' ? ` מתוך ${c.openQuotes}` : ''})
          </>
        )}
      </p>
    </li>
  );
}
