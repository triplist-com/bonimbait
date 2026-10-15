import type { ReactNode } from 'react';
import { approvalCounts } from '@/lib/bonimos/approvals';
import type { ManagedProjectData } from '@/lib/bonimos/types';
import { ActivitySection } from './ActivitySection';
import { BudgetSection } from './BudgetSection';
import { DocumentsSection } from './DocumentsSection';
import { MilestonesSection } from './MilestonesSection';
import { PaymentsSection } from './PaymentsSection';
import { PhotosSection } from './PhotosSection';
import { ProjectHeader } from './ProjectHeader';

/**
 * The managed project, shared by the manager and the client: one
 * ManagedProjectData, role-appropriate actions inside each section (the
 * database enforces them anyway). Laptop first: the work column and the
 * project log side by side from xl; one column in working order on phones.
 * Server-safe composition; the demo renders it in the browser from fixtures.
 */
export function ManagedProjectView({
  data,
  backHref,
  backLabel,
  banner,
}: {
  data: ManagedProjectData;
  backHref?: string | null;
  backLabel?: string;
  /** Above the sections (the demo's role switch). */
  banner?: ReactNode;
}) {
  const counts = approvalCounts(data.payments);
  const open = counts.pendingReview + counts.pendingClient + counts.approvedUnpaid;
  const sections: Array<[string, string, number?]> = [
    ['payments', 'אישורי תשלום', open || undefined],
    ['budget', 'תקציב מול ביצוע'],
    ['schedule', 'לוח זמנים'],
    ['photos', 'תמונות מהשטח'],
    ['documents', 'מסמכים'],
    ['activity', 'יומן'],
  ];

  return (
    <div className="bg-paper pb-16">
      <ProjectHeader data={data} backHref={backHref} backLabel={backLabel} />
      <div className="container-page">
        <nav aria-label="חלקי הפרויקט" className="-mx-4 overflow-x-auto px-4 py-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {sections.map(([id, label, badge]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-[0.8125rem] font-semibold text-ink-700 transition-colors hover:border-primary-600 hover:text-primary-700"
                >
                  {label}
                  {badge != null && (
                    <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-2xs font-bold text-white">
                      {badge}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {banner}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-6">
          <div className="min-w-0 space-y-5 xl:space-y-6">
            <PaymentsSection data={data} />
            <BudgetSection data={data} />
            <MilestonesSection data={data} />
            <PhotosSection data={data} />
            <DocumentsSection data={data} />
          </div>
          <aside className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:overscroll-contain xl:rounded-3xl">
            <ActivitySection data={data} />
          </aside>
        </div>
      </div>
    </div>
  );
}
