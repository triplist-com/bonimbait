import { ChevronDown, Coins, History, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Money, Variance } from '@/components/hub/Money';
import { budgetCategory, type CategorySummary } from '@/lib/hub/budget';
import { formatMoney, formatMoneyExact } from '@/lib/hub/format';
import { getStage } from '@/lib/stages';
import { dataViz } from '@/lib/design/tokens';
import { formatPct, isApprovedVersion, projectBudget, stageVariance, versionHistory, type StageVarianceRow, type VersionChange } from '@/lib/bonimos/budget';
import type { ManagedProjectData } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { BudgetVersionButton } from './BudgetVersionDialog';
import { OsSection, VariancePctBadge, dateLabel } from './parts';

/**
 * תקציב מול ביצוע: the approved budget (versioned), what is known so far
 * (signed quotes, payments) and the variance, by the owner's 7 stages and by
 * category, plus the change log of every version: who changed what, and why.
 * Server-safe; the manager's "new version" form is a client leaf.
 */
export function BudgetSection({ data }: { data: ManagedProjectData }) {
  const { version, summary, health } = projectBudget(data.versions, data.budgetItems);
  const stages = stageVariance(summary);
  const history = versionHistory(data.versions);
  const names = new Map(data.people.map((p) => [p.userId, p.name]));
  const isManager = data.viewer.role === 'manager';
  const max = Math.max(1, ...stages.map((s) => Math.max(s.planned, s.forecast)));
  const categories = summary.categories.filter((c) => c.planned > 0 || c.forecastBasis !== 'plan');
  const ledger = data.budgetItems.slice(0, 40);

  return (
    <OsSection
      id="budget"
      icon={<Coins />}
      title="תקציב מול ביצוע"
      subtitle={
        version ? (
          <>
            {isApprovedVersion(version) ? 'תקציב מאושר' : version.label} · גרסה <span className="num">{version.versionNo}</span>. לא כולל מחיר המגרש,
            לפני מע״מ.
          </>
        ) : (
          'עוד אין תקציב מאושר לפרויקט.'
        )
      }
      action={isManager ? <BudgetVersionButton data={data} /> : undefined}
    >
      {!version ? (
        <p className="flex items-start gap-2 rounded-2xl bg-info-50 p-4 text-body-sm text-info-800">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info-700" />
          {isManager
            ? 'אשרו תקציב ראשון: המערכת מציעה בסיס ממחירון בונים בית 2026 לפי גודל הבית והאזור, ואתם מתאימים לפי הכמויות וההצעות.'
            : 'מנהל הפרויקט יאשר כאן את התקציב, ומאותו רגע תראו בכל שלב איפה אתם עומדים מולו.'}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Figure label="תקציב מאושר" value={<Money value={health.approved} />} />
            <Figure label="צפי לפי מה שידוע" value={<Money value={health.forecast} />} hint={<VariancePctBadge pct={health.variancePct} status={health.status} size="sm" />} />
            <Figure label="חוזים והצעות שנבחרו" value={<Money value={health.committed} />} />
            <Figure
              label="שולם עד היום"
              value={<Money value={health.actual} />}
              hint={
                <>
                  <span className="num">{Math.round(health.paidShare * 100)}%</span> מהתקציב
                </>
              }
            />
          </dl>

          <h3 className="mb-1 mt-6 text-title-sm text-ink-900">לפי שלבי הבנייה</h3>
          <p className="mb-3 text-caption text-ink-600">
            <Legend className="bg-ink-300" /> מתוכנן <Legend className="ms-3 bg-ink-800" /> צפי בתוך התקציב <Legend className="ms-3 bg-primary-600" /> צפי
            מעל התקציב <Legend className="ms-3" style={{ backgroundColor: dataViz.diverging.negative[1] }} /> צפי מתחת לתקציב
          </p>
          <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
            {stages.map((s) => (
              <StageRow key={s.stage ?? 'other'} row={s} max={max} />
            ))}
          </ul>

          <details className="group/cat mt-3 rounded-2xl border border-ink-100">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-body-sm font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
              <span>
                לפי קטגוריה (<span className="num">{categories.length}</span>)
              </span>
              <ChevronDown aria-hidden="true" className="size-4 text-ink-500 transition-transform group-open/cat:rotate-180" />
            </summary>
            <CategoryTable categories={categories} />
          </details>

          {ledger.length > 0 && (
            <details className="group/led mt-2 rounded-2xl border border-ink-100">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-body-sm font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
                <span>
                  תשלומים והצעות שנרשמו (<span className="num">{data.budgetItems.length}</span>)
                </span>
                <ChevronDown aria-hidden="true" className="size-4 text-ink-500 transition-transform group-open/led:rotate-180" />
              </summary>
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {ledger.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-body-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-ink-900">{i.label || budgetCategory(i.category)?.label}</span>
                      <span className="ms-2 text-caption text-ink-500">
                        {[i.vendor, i.occurredOn ? dateLabel(i.occurredOn, data.today) : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge size="sm" tone={i.kind === 'actual' ? 'success' : i.status === 'accepted' ? 'info' : 'neutral'}>
                        {i.kind === 'actual' ? 'שולם' : i.status === 'accepted' ? 'הצעה שנבחרה' : i.status === 'rejected' ? 'הצעה שנדחתה' : 'הצעה פתוחה'}
                      </Badge>
                      <Money value={i.amount} className="font-semibold text-ink-900" />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 flex items-center gap-2 text-title-sm text-ink-900">
            <History aria-hidden="true" className="size-4 text-primary-600" />
            יומן שינויים בתקציב
          </h3>
          <ol className="space-y-3 border-s-2 border-ink-100 ps-4">
            {history.map((h) => (
              <VersionEntry key={h.version.id} change={h} creator={h.version.createdBy ? names.get(h.version.createdBy) ?? null : null} today={data.today} />
            ))}
          </ol>
        </div>
      )}
    </OsSection>
  );
}

function Legend({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" style={style} className={cn('me-1 inline-block size-2.5 rounded-full align-middle', className)} />;
}

function Figure({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-paper p-3.5 ring-1 ring-inset ring-ink-100">
      <dt className="text-caption font-semibold text-ink-600">{label}</dt>
      <dd className="mt-0.5 text-title text-ink-900">{value}</dd>
      {hint && <dd className="mt-1">{hint}</dd>}
    </div>
  );
}

function stageName(stage: StageVarianceRow['stage']): string {
  return stage ? getStage(stage)?.label ?? stage : 'אחר ובלת״מ';
}

function StageRow({ row, max }: { row: StageVarianceRow; max: number }) {
  const over = row.status === 'over';
  const under = row.status === 'under';
  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_11rem] sm:items-center sm:gap-4">
      <div className="flex items-baseline justify-between gap-2 sm:block">
        <p className="text-body-sm font-bold text-ink-900">{stageName(row.stage)}</p>
        <p className="text-caption text-ink-600">
          מתוכנן <Money value={row.planned} />
        </p>
      </div>
      <div className="space-y-1" aria-hidden="true">
        <div className="h-2 rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-ink-300" style={{ width: `${(row.planned / max) * 100}%` }} />
        </div>
        <div className="h-2 rounded-full bg-ink-100">
          {row.hasData && (
            <div
              className={cn('h-full rounded-full', over ? 'bg-primary-600' : !under && 'bg-ink-800')}
              style={{ width: `${(row.forecast / max) * 100}%`, ...(under ? { backgroundColor: dataViz.diverging.negative[1] } : {}) }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        {row.hasData ? (
          <>
            <span className="text-caption text-ink-600">
              צפי <Money value={row.forecast} />
            </span>
            <VariancePctBadge pct={row.variancePct} status={row.status} size="sm" short />
          </>
        ) : (
          <span className="text-caption text-ink-500">עוד אין חוזים או תשלומים</span>
        )}
      </div>
    </li>
  );
}

const BASIS_TEXT: Record<CategorySummary['forecastBasis'], string> = {
  actual: 'לפי התשלומים',
  committed: 'לפי החוזה',
  quote: 'לפי הצעה פתוחה',
  plan: 'לפי התכנון',
};

function CategoryTable({ categories }: { categories: CategorySummary[] }) {
  return (
    <div className="border-t border-ink-100">
      <table className="hidden w-full text-body-sm sm:table">
        <caption className="sr-only">תקציב מול ביצוע לפי קטגוריה</caption>
        <thead className="text-caption text-ink-600">
          <tr className="border-b border-ink-100">
            <th scope="col" className="px-4 py-2 text-start font-semibold">
              קטגוריה
            </th>
            <th scope="col" className="px-3 py-2 text-end font-semibold">
              מתוכנן
            </th>
            <th scope="col" className="px-3 py-2 text-end font-semibold">
              צפי
            </th>
            <th scope="col" className="px-3 py-2 text-end font-semibold">
              שולם
            </th>
            <th scope="col" className="px-4 py-2 text-end font-semibold">
              סטייה
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {categories.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="px-4 py-2.5 text-start font-semibold text-ink-900">
                {c.label}
                <span className="block text-caption font-normal text-ink-500">{BASIS_TEXT[c.forecastBasis]}</span>
              </th>
              <td className="px-3 py-2.5 text-end">
                <Money value={c.planned} />
              </td>
              <td className="px-3 py-2.5 text-end">
                <Money value={c.forecast} />
              </td>
              <td className="px-3 py-2.5 text-end">{c.actual > 0 ? <Money value={c.actual} /> : '—'}</td>
              <td className={cn('px-4 py-2.5 text-end font-semibold', c.status === 'over' ? 'text-warning-700' : c.status === 'under' ? 'text-info-700' : 'text-ink-700')}>
                {c.forecastBasis === 'plan' ? '—' : <Variance value={c.variance} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-ink-100 sm:hidden">
        {categories.map((c) => (
          <li key={c.id} className="px-4 py-2.5 text-body-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-ink-900">{c.label}</span>
              <span className={cn('font-semibold', c.status === 'over' ? 'text-warning-700' : c.status === 'under' ? 'text-info-700' : 'text-ink-700')}>
                {c.forecastBasis === 'plan' ? '' : <Variance value={c.variance} />}
              </span>
            </div>
            <p className="text-caption text-ink-600">
              מתוכנן {formatMoney(c.planned)} · צפי {formatMoney(c.forecast)} ({BASIS_TEXT[c.forecastBasis]})
              {c.actual > 0 && <> · שולם {formatMoney(c.actual)}</>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionEntry({ change, creator, today }: { change: VersionChange; creator: string | null; today: string }) {
  const { version, diff, previous } = change;
  const top = diff.changes.slice(0, 5);
  return (
    <li className="relative">
      <span aria-hidden="true" className={cn('absolute -start-[1.4rem] top-1.5 size-3 rounded-full ring-4 ring-white', version.isCurrent ? 'bg-primary-600' : 'bg-ink-300')} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-body-sm font-bold text-ink-900">
          גרסה <span className="num">{version.versionNo}</span> · {isApprovedVersion(version) ? 'תקציב מאושר' : version.label}
        </p>
        {version.isCurrent && (
          <Badge tone="brand" size="sm">
            נוכחית
          </Badge>
        )}
        <span className="text-caption text-ink-500">
          {dateLabel(version.createdAt.slice(0, 10), today)}
          {creator ? ` · ${creator}` : ''}
        </span>
      </div>
      {version.note && <p className="mt-1 text-body-sm text-ink-700">״{version.note}״</p>}
      <p className="mt-1.5 text-caption text-ink-600">
        {previous ? (
          <>
            סך הכול {formatMoneyExact(diff.before)} ← <span className="font-semibold text-ink-900">{formatMoneyExact(diff.after)}</span> (
            <Variance value={diff.delta} />
            {diff.deltaPct != null && (
              <>
                , <span className="num">{formatPct(diff.deltaPct)}</span>
              </>
            )}
            )
          </>
        ) : (
          <>
            סך הכול <span className="font-semibold text-ink-900">{formatMoneyExact(diff.after)}</span>
          </>
        )}
      </p>
      {previous && top.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="מה השתנה">
          {top.map((c) => (
            <li key={c.category} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-caption text-ink-700 ring-1 ring-inset ring-ink-100">
              {c.label} <Variance value={c.delta} className={cn('font-semibold', c.delta > 0 ? 'text-warning-700' : 'text-info-700')} />
            </li>
          ))}
          {diff.changes.length > top.length && (
            <li className="inline-flex items-center rounded-full px-2 py-1 text-caption text-ink-500">
              ועוד <span className="num mx-1">{diff.changes.length - top.length}</span>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
