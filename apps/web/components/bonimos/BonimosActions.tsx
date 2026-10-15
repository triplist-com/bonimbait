'use client';

/**
 * One project view, two data sources. The interactive leaves (approvals,
 * budget versions, milestones, photos, documents, notes) call these actions
 * and don't care where the data lives:
 *   member  server actions bound to the project (MemberBonimosProvider)
 *   demo    in-memory fixtures, /platform/demo/bonimos/ (DemoBonimos)
 */
import { createContext, useContext } from 'react';
import type { DocumentCategory, StageId } from '@/lib/hub/types';
import type { PaymentAction } from '@/lib/bonimos/types';

export interface Outcome {
  ok: boolean;
  message?: string;
}

export interface PaymentRequestDraft {
  contractor: string;
  title: string;
  category: string;
  /** Whole shekels. */
  amount: number;
  milestoneId?: string | null;
  dueOn?: string | null;
  note?: string | null;
  /** The contractor's invoice; uploaded to the project's documents first. */
  file?: File | null;
}

export interface MilestoneDraftInput {
  id?: string | null;
  stage: StageId;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  note?: string | null;
}

export interface PhotoUploadInput {
  files: File[];
  captions: string[];
  stage: StageId | null;
  takenOn: string;
  onProgress?: (done: number, total: number) => void;
}

export interface BonimosActions {
  mode: 'member' | 'demo';
  requestPayment(input: PaymentRequestDraft): Promise<Outcome>;
  transition(requestId: string, action: PaymentAction, opts?: { amount?: number | null; note?: string | null; paidOn?: string | null }): Promise<Outcome>;
  createBudgetVersion(input: { plan: Record<string, number>; note: string }): Promise<Outcome>;
  saveMilestone(input: MilestoneDraftInput): Promise<Outcome>;
  setMilestoneProgress(id: string, step: 'start' | 'complete' | 'reopen'): Promise<Outcome>;
  deleteMilestone(id: string): Promise<Outcome>;
  createSchedule(): Promise<Outcome>;
  addNote(body: string): Promise<Outcome>;
  deleteNote(id: string): Promise<Outcome>;
  uploadDocument(file: File, category: DocumentCategory): Promise<Outcome & { id?: string }>;
  openDocument(id: string): Promise<Outcome>;
  deleteDocument(id: string): Promise<Outcome>;
  uploadPhotos(input: PhotoUploadInput): Promise<Outcome & { added?: number }>;
  deletePhoto(id: string): Promise<Outcome>;
}

const BonimosActionsContext = createContext<BonimosActions | null>(null);

export const BonimosActionsProvider = BonimosActionsContext.Provider;

export function useBonimosActions(): BonimosActions {
  const ctx = useContext(BonimosActionsContext);
  if (!ctx) throw new Error('useBonimosActions must be used inside a Bonim.Os provider');
  return ctx;
}

export const NETWORK_ERROR: Outcome = { ok: false, message: 'אין חיבור כרגע. בדקו את האינטרנט ונסו שוב.' };
