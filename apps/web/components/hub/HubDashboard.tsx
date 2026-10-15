import type { ReactNode } from 'react';
import type { HubViewData } from '@/lib/hub/types';
import { BudgetPanel } from './BudgetPanel';
import { DocumentsPanel } from './DocumentsPanel';
import { HubHeader } from './HubHeader';
import { ProjectFilePanel } from './ProjectFilePanel';
import { ProsPanel } from './ProsPanel';
import { Roadmap } from './Roadmap';
import { SavedPanel } from './SavedPanel';
import { TasksPanel } from './TasksPanel';
import { WeeklyActions } from './WeeklyActions';

const SECTIONS: Array<[string, string]> = [
  ['week', 'השבוע'],
  ['roadmap', 'מפת הדרך'],
  ['budget', 'תקציב'],
  ['tasks', 'משימות'],
  ['documents', 'מסמכים'],
  ['file', 'תיק הפרויקט'],
  ['pros', 'אנשי מקצוע'],
  ['saved', 'שמורים'],
];

/**
 * The whole "הבית שלי" dashboard from one HubViewData, in any mode (member,
 * local, demo). Must stay client-safe: local and demo modes render it in the
 * browser. Mobile: one column in weekly-use order; desktop: the work column
 * and a side column with the project file, pros and saved items.
 */
export function HubDashboard({
  data,
  editHref,
  headerActions,
  banner,
  stagePageBase,
}: {
  data: HubViewData;
  editHref?: string | null;
  headerActions?: ReactNode;
  /** A notice above the sections (local mode: "saved on this device"). */
  banner?: ReactNode;
  /** Base path of the stage pages; null hides the links (demo). */
  stagePageBase?: string | null;
}) {
  return (
    <div className="bg-paper pb-16">
      <HubHeader data={data} editHref={editHref} actions={headerActions} />
      <div className="container-page">
        <nav aria-label="חלקי הבית שלי" className="-mx-4 overflow-x-auto px-4 py-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex h-9 items-center rounded-full border border-ink-200 bg-white px-3.5 text-[0.8125rem] font-semibold text-ink-700 transition-colors hover:border-primary-600 hover:text-primary-700"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {banner}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
          <div className="min-w-0 space-y-5 lg:space-y-6">
            <WeeklyActions data={data} />
            <Roadmap data={data} stagePageBase={stagePageBase === undefined ? '/my-home/stage/' : stagePageBase} />
            <BudgetPanel data={data} />
            <TasksPanel tasks={data.tasks} today={data.today} />
            <DocumentsPanel documents={data.documents} />
          </div>
          <aside className="min-w-0 space-y-5 lg:space-y-6" aria-label="התיק, אנשי המקצוע והשמורים">
            <ProjectFilePanel data={data} />
            <ProsPanel shortlist={data.shortlist} contacts={data.contacts} />
            <SavedPanel saved={data.saved} localNotice={data.mode === 'local'} />
          </aside>
        </div>
      </div>
    </div>
  );
}
