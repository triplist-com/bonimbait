import type { ManagerProjectSummary } from '@/lib/bonimos/types';
import { ManagerProjectList } from './ManagerProjectList';

/** The workspace page body (the demo renders it from fixtures). */
export function ManagerWorkspace({
  projects,
  today,
  now,
  hrefFor,
}: {
  projects: ManagerProjectSummary[];
  today: string;
  now: string;
  hrefFor?: (id: string) => string;
}) {
  const reviews = projects.reduce((a, p) => a + p.approvals.pendingReview, 0);
  const late = projects.filter((p) => p.nextMilestone?.late).length;
  const over = projects.filter((p) => p.budget.status === 'over').length;
  return (
    <div className="container-page py-6 sm:py-9">
      <p className="eyebrow">
        <span dir="ltr">Bonim.Os</span> · מערכת הליווי
      </p>
      <h1 className="mt-1 text-headline text-ink-900">הפרויקטים שלי</h1>
      <p className="mt-2 max-w-2xl text-body text-ink-600">
        {projects.length
          ? 'כל לקוח בליווי, במבט אחד: באיזה שלב הוא, איך התקציב עומד, מה אבן הדרך הבאה, ואילו בקשות תשלום מחכות לכם.'
          : 'כאן יופיעו הלקוחות שבליווי שלכם.'}
      </p>
      {projects.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="פרויקטים בליווי" value={projects.length} />
          <Stat label="בקשות תשלום לבדיקה" value={reviews} tone={reviews ? 'brand' : undefined} />
          <Stat label="אבני דרך באיחור" value={late} tone={late ? 'warning' : undefined} />
          <Stat label="פרויקטים מעל התקציב" value={over} tone={over ? 'warning' : undefined} />
        </dl>
      )}
      <div className="mt-6">
        <ManagerProjectList projects={projects} today={today} now={now} hrefFor={hrefFor} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brand' | 'warning' }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-xs ring-1 ring-inset ring-ink-100">
      <dt className="text-caption font-semibold text-ink-600">{label}</dt>
      <dd className={`num mt-1 text-headline-sm ${tone === 'brand' ? 'text-primary-700' : tone === 'warning' ? 'text-warning-700' : 'text-ink-900'}`}>{value}</dd>
    </div>
  );
}
