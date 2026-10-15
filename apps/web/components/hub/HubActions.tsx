'use client';

/**
 * One dashboard, three modes. The interactive leaves (checklist ticks,
 * budget form, tasks, documents) call these actions and don't care where
 * the data lives:
 *   member  server actions (components/hub/MemberHubProvider.tsx)
 *   local   localStorage, anonymous visitors (components/hub/LocalHub.tsx)
 *   demo    in-memory fixtures, /platform/demo/hub/ (components/hub/DemoHub.tsx)
 * Features that need an account report `needsAccount` in local mode.
 */
import { createContext, useContext } from 'react';
import type { BudgetItemStatus, DocumentCategory, HubMode, PlannerEstimate, SavedKind, StageId } from '@/lib/hub/types';

export interface HubActionOutcome {
  ok: boolean;
  message?: string;
}

export interface BudgetItemDraft {
  kind: 'quote' | 'actual';
  category: string;
  amount: number;
  label?: string | null;
  vendor?: string | null;
  occurredOn?: string | null;
}

export interface HubActions {
  mode: HubMode;
  /** True when budget, tasks and documents need signing up first. */
  needsAccount: boolean;
  toggleChecklist(itemId: string, done: boolean): Promise<HubActionOutcome>;
  setStage(stage: StageId): Promise<HubActionOutcome>;
  addBudgetItem(input: BudgetItemDraft): Promise<HubActionOutcome>;
  setQuoteStatus(id: string, status: Exclude<BudgetItemStatus, 'paid'>): Promise<HubActionOutcome>;
  deleteBudgetItem(id: string): Promise<HubActionOutcome>;
  rebaseFromPlanner(planner: PlannerEstimate): Promise<HubActionOutcome>;
  addTask(input: { title: string; dueOn?: string | null }): Promise<HubActionOutcome>;
  addSuggestedTasks(): Promise<HubActionOutcome>;
  toggleTask(id: string, done: boolean): Promise<HubActionOutcome>;
  deleteTask(id: string): Promise<HubActionOutcome>;
  removeSaved(kind: SavedKind, ref: string): Promise<HubActionOutcome>;
  uploadDocument(file: File, category: DocumentCategory): Promise<HubActionOutcome>;
  openDocument(id: string): Promise<HubActionOutcome>;
  deleteDocument(id: string): Promise<HubActionOutcome>;
}

const HubActionsContext = createContext<HubActions | null>(null);

export const HubActionsProvider = HubActionsContext.Provider;

export function useHubActions(): HubActions {
  const ctx = useContext(HubActionsContext);
  if (!ctx) throw new Error('useHubActions must be used inside a hub provider');
  return ctx;
}

export const NEEDS_ACCOUNT: HubActionOutcome = {
  ok: false,
  message: 'הירשמו בחינם כדי לשמור את זה בחשבון שלכם.',
};
