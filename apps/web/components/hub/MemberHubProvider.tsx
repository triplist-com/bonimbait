'use client';

/**
 * Member mode: hub actions are server actions (app/my-home/actions.ts). Each
 * one revalidates /my-home/*, so the server-rendered dashboard refreshes by
 * itself. Documents upload straight from the browser to the private hub-docs
 * bucket (RLS: project members), then the row is registered.
 */
import { useMemo, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import {
  addBudgetItemAction,
  addSuggestedTasksAction,
  addTaskAction,
  deleteBudgetItemAction,
  deleteDocumentAction,
  deleteTaskAction,
  documentUrlAction,
  prepareDocumentUploadAction,
  rebaseBudgetFromPlannerAction,
  registerDocumentAction,
  setQuoteStatusAction,
  setStageAction,
  toggleChecklistAction,
  toggleSavedAction,
  toggleTaskAction,
} from '@/app/my-home/actions';
import { HubActionsProvider, type HubActionOutcome, type HubActions } from './HubActions';

function outcome(result: { ok: boolean; message?: string }): HubActionOutcome {
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

const NETWORK: HubActionOutcome = { ok: false, message: 'אין חיבור כרגע. בדקו את האינטרנט ונסו שוב.' };

async function safe(run: () => Promise<{ ok: boolean; message?: string }>): Promise<HubActionOutcome> {
  try {
    return outcome(await run());
  } catch {
    return NETWORK;
  }
}

async function uploadDocument(file: File, category: Parameters<HubActions['uploadDocument']>[1]): Promise<HubActionOutcome> {
  try {
    const slot = await prepareDocumentUploadAction({ mimeType: file.type, sizeBytes: file.size });
    if (!slot.ok) return outcome(slot);
    const { createClient } = await import('@/lib/supabase/browser');
    const { error } = await createClient()
      .storage.from('hub-docs')
      .upload(slot.path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (error) return { ok: false, message: 'ההעלאה נכשלה. נסו שוב, או קובץ קטן יותר.' };
    return outcome(await registerDocumentAction({ path: slot.path, fileName: file.name, category }));
  } catch {
    return NETWORK;
  }
}

async function openDocument(id: string): Promise<HubActionOutcome> {
  // Open the tab inside the click (popup blockers), then point it at the signed URL.
  const tab = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
  try {
    const res = await documentUrlAction(id);
    if (!res.ok) {
      tab?.close();
      return outcome(res);
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = res.url;
    } else {
      window.location.href = res.url;
    }
    return { ok: true };
  } catch {
    tab?.close();
    return NETWORK;
  }
}

export default function MemberHubProvider({ children }: { children: ReactNode }) {
  const actions = useMemo<HubActions>(
    () => ({
      mode: 'member',
      needsAccount: false,
      toggleChecklist: (itemId, done) => safe(() => toggleChecklistAction(itemId, done)),
      setStage: (stage) => safe(() => setStageAction(stage)),
      addBudgetItem: (input) => safe(() => addBudgetItemAction(input)),
      setQuoteStatus: (id, status) => safe(() => setQuoteStatusAction(id, status)),
      deleteBudgetItem: (id) => safe(() => deleteBudgetItemAction(id)),
      rebaseFromPlanner: (planner) => safe(() => rebaseBudgetFromPlannerAction(planner)),
      addTask: (input) => safe(() => addTaskAction(input)),
      addSuggestedTasks: () => safe(() => addSuggestedTasksAction()),
      toggleTask: (id, done) => safe(() => toggleTaskAction(id, done)),
      deleteTask: (id) => safe(() => deleteTaskAction(id)),
      removeSaved: (kind, ref) => safe(() => toggleSavedAction({ kind, ref, saved: false })),
      uploadDocument,
      openDocument,
      deleteDocument: (id) => safe(() => deleteDocumentAction(id)),
    }),
    [],
  );
  return (
    <ToastProvider>
      <HubActionsProvider value={actions}>{children}</HubActionsProvider>
    </ToastProvider>
  );
}
