'use client';

/**
 * Demo mode for /platform/demo/hub/: the real dashboard on the משפחת לוי
 * fixture. Everything is clickable (tick the checklist, add a quote or a
 * task, upload a file name) and lives in memory only: nothing is saved,
 * nothing reaches the DB, no lead is created.
 */
import { useMemo, useRef, useState } from 'react';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { weeklyActions } from '@/lib/hub/roadmap';
import { israelToday } from '@/lib/hub/onboarding';
import type { HubViewData } from '@/lib/hub/types';
import { HubActionsProvider, type HubActions } from './HubActions';
import { HubDashboard } from './HubDashboard';

const DEMO_FILES = { ok: false, message: 'בתצוגת ההדגמה הקבצים לדוגמה בלבד.' };

function DemoDashboard({ initial }: { initial: HubViewData }) {
  const [data, setData] = useState(initial);
  const seq = useRef(0);
  const { toast } = useToast();
  const id = () => `demo-new-${(seq.current += 1)}`;

  const actions = useMemo<HubActions>(
    () => ({
      mode: 'demo',
      needsAccount: false,
      async toggleChecklist(itemId, done) {
        setData((d) => ({
          ...d,
          checklistDone: done ? Array.from(new Set([...d.checklistDone, itemId])) : d.checklistDone.filter((x) => x !== itemId),
        }));
        return { ok: true };
      },
      async setStage(stage) {
        setData((d) => ({ ...d, project: { ...d.project, stage }, file: { ...d.file, stage } }));
        return { ok: true };
      },
      async addBudgetItem(input) {
        setData((d) => ({
          ...d,
          budgetItems: [
            {
              id: id(),
              kind: input.kind,
              category: input.category,
              label: input.label ?? null,
              vendor: input.vendor ?? null,
              amount: input.amount,
              status: input.kind === 'quote' ? 'open' : 'paid',
              occurredOn: input.occurredOn ?? null,
              createdAt: new Date().toISOString(),
            },
            ...d.budgetItems,
          ],
        }));
        return { ok: true };
      },
      async setQuoteStatus(itemId, status) {
        setData((d) => ({ ...d, budgetItems: d.budgetItems.map((i) => (i.id === itemId ? { ...i, status } : i)) }));
        return { ok: true };
      },
      async deleteBudgetItem(itemId) {
        setData((d) => ({ ...d, budgetItems: d.budgetItems.filter((i) => i.id !== itemId) }));
        return { ok: true };
      },
      async rebaseFromPlanner() {
        return { ok: true };
      },
      async addTask(input) {
        setData((d) => ({ ...d, tasks: [...d.tasks, { id: id(), title: input.title, dueOn: input.dueOn ?? null, done: false, stage: d.project.stage }] }));
        return { ok: true };
      },
      async addSuggestedTasks() {
        setData((d) => {
          if (!d.project.stage) return d;
          const today = israelToday();
          const next = weeklyActions(d.project.stage, new Set(d.checklistDone), 3).map((a, i) => ({
            id: id(),
            title: a.title,
            dueOn: new Date(Date.parse(`${today}T00:00:00Z`) + 7 * (i + 1) * 86_400_000).toISOString().slice(0, 10),
            done: false,
            stage: a.stage,
          }));
          return { ...d, tasks: [...d.tasks, ...next] };
        });
        return { ok: true };
      },
      async toggleTask(taskId, done) {
        setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, done } : t)) }));
        return { ok: true };
      },
      async deleteTask(taskId) {
        setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) }));
        return { ok: true };
      },
      async removeSaved(kind, ref) {
        setData((d) => ({
          ...d,
          saved: d.saved.filter((s) => !(s.kind === kind && s.ref === ref)),
          shortlist: kind === 'business' ? d.shortlist.filter((p) => p.id !== ref) : d.shortlist,
        }));
        return { ok: true };
      },
      async uploadDocument(file, category) {
        setData((d) => ({
          ...d,
          documents: [
            { id: id(), fileName: file.name, mimeType: file.type, sizeBytes: file.size, category, stage: d.project.stage, note: null, createdAt: new Date().toISOString() },
            ...d.documents,
          ],
        }));
        toast({ title: 'בהדגמה הקובץ לא נשמר', description: 'בפלטפורמה הוא עולה לתיק הפרטי של הפרויקט.', tone: 'info' });
        return { ok: true };
      },
      async openDocument() {
        return DEMO_FILES;
      },
      async deleteDocument(docId) {
        setData((d) => ({ ...d, documents: d.documents.filter((x) => x.id !== docId) }));
        return { ok: true };
      },
    }),
    [toast],
  );

  return (
    <HubActionsProvider value={actions}>
      <HubDashboard data={data} editHref={null} stagePageBase={null} />
    </HubActionsProvider>
  );
}

export default function DemoHub({ data }: { data: HubViewData }) {
  return (
    <ToastProvider>
      <DemoDashboard initial={data} />
    </ToastProvider>
  );
}
