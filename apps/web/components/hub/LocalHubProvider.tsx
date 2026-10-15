'use client';

/**
 * Local mode (anonymous visitors): hub actions on localStorage. Checklist,
 * stage and saved items work; budget, tasks and documents need an account.
 */
import { useMemo, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { readLocalHub, readSaved, toggleLocalSaved, writeChecklist, writeDraft } from '@/lib/hub/local';
import { HubActionsProvider, NEEDS_ACCOUNT, type HubActions } from './HubActions';

export function useLocalHubActions(): HubActions {
  return useMemo<HubActions>(
    () => ({
      mode: 'local',
      needsAccount: true,
      async toggleChecklist(itemId, done) {
        const current = readLocalHub().checklist.filter((id) => id !== itemId);
        writeChecklist(done ? [...current, itemId] : current);
        return { ok: true };
      },
      async setStage(stage) {
        writeDraft({ ...readLocalHub().draft, stage });
        return { ok: true };
      },
      async removeSaved(kind, ref) {
        const item = readSaved().find((i) => i.kind === kind && i.ref === ref);
        toggleLocalSaved({ kind, ref, title: item?.title ?? '' }, false);
        return { ok: true };
      },
      addBudgetItem: async () => NEEDS_ACCOUNT,
      setQuoteStatus: async () => NEEDS_ACCOUNT,
      deleteBudgetItem: async () => NEEDS_ACCOUNT,
      rebaseFromPlanner: async () => NEEDS_ACCOUNT,
      addTask: async () => NEEDS_ACCOUNT,
      addSuggestedTasks: async () => NEEDS_ACCOUNT,
      toggleTask: async () => NEEDS_ACCOUNT,
      deleteTask: async () => NEEDS_ACCOUNT,
      uploadDocument: async () => NEEDS_ACCOUNT,
      openDocument: async () => NEEDS_ACCOUNT,
      deleteDocument: async () => NEEDS_ACCOUNT,
    }),
    [],
  );
}

export default function LocalHubProvider({ children }: { children: ReactNode }) {
  const actions = useLocalHubActions();
  return (
    <ToastProvider>
      <HubActionsProvider value={actions}>{children}</HubActionsProvider>
    </ToastProvider>
  );
}
