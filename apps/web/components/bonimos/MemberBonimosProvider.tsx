'use client';

/**
 * Member mode: Bonim.Os actions are server actions bound to one project
 * (app/manage/actions.ts). Each revalidates /manage/*, so the server-rendered
 * view refreshes by itself. Files go straight from the browser to private
 * storage under RLS: documents to hub-docs, site photos (resized here first)
 * to bonimos-photos. Then the server registers them.
 */
import { useMemo, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import {
  addNoteAction,
  createBudgetVersionAction,
  createScheduleAction,
  deleteDocumentAction,
  deleteMilestoneAction,
  deleteNoteAction,
  deletePhotoAction,
  documentUrlAction,
  preparePhotosAction,
  prepareDocumentAction,
  registerDocumentAction,
  registerPhotosAction,
  requestPaymentAction,
  saveMilestoneAction,
  setMilestoneProgressAction,
  transitionPaymentAction,
} from '@/app/manage/actions';
import type { DocumentCategory } from '@/lib/hub/types';
import { BonimosActionsProvider, NETWORK_ERROR, type BonimosActions, type Outcome } from './BonimosActions';

function outcome(result: { ok: boolean; message?: string }): Outcome {
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

async function safe(run: () => Promise<{ ok: boolean; message?: string }>): Promise<Outcome> {
  try {
    return outcome(await run());
  } catch {
    return NETWORK_ERROR;
  }
}

async function browserStorage() {
  const { createClient } = await import('@/lib/supabase/browser');
  return createClient().storage;
}

async function uploadDocument(projectId: string, file: File, category: DocumentCategory): Promise<Outcome & { id?: string }> {
  try {
    const slot = await prepareDocumentAction(projectId, { mimeType: file.type, sizeBytes: file.size });
    if (!slot.ok) return outcome(slot);
    const { error } = await (await browserStorage())
      .from('hub-docs')
      .upload(slot.path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (error) return { ok: false, message: 'ההעלאה נכשלה. נסו שוב, או קובץ קטן יותר.' };
    const reg = await registerDocumentAction(projectId, { path: slot.path, fileName: file.name, category });
    return reg.ok ? { ok: true, id: reg.id } : outcome(reg);
  } catch {
    return NETWORK_ERROR;
  }
}

async function openDocument(projectId: string, id: string): Promise<Outcome> {
  // Open the tab inside the click (popup blockers), then point it at the signed URL.
  const tab = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
  try {
    const res = await documentUrlAction(projectId, id);
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
    return NETWORK_ERROR;
  }
}

export default function MemberBonimosProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const actions = useMemo<BonimosActions>(
    () => ({
      mode: 'member',
      async requestPayment(input) {
        try {
          let attachmentId: string | null = null;
          if (input.file) {
            const up = await uploadDocument(projectId, input.file, 'receipt');
            if (!up.ok) return up;
            attachmentId = up.id ?? null;
          }
          const { file: _file, ...rest } = input;
          void _file;
          return outcome(await requestPaymentAction(projectId, { ...rest, attachmentId }));
        } catch {
          return NETWORK_ERROR;
        }
      },
      transition: (requestId, action, opts) => safe(() => transitionPaymentAction(projectId, requestId, action, opts)),
      createBudgetVersion: (input) => safe(() => createBudgetVersionAction(projectId, input)),
      saveMilestone: (input) => safe(() => saveMilestoneAction(projectId, input)),
      setMilestoneProgress: (id, step) => safe(() => setMilestoneProgressAction(projectId, id, step)),
      deleteMilestone: (id) => safe(() => deleteMilestoneAction(projectId, id)),
      createSchedule: () => safe(() => createScheduleAction(projectId)),
      addNote: (body) => safe(() => addNoteAction(projectId, body)),
      deleteNote: (id) => safe(() => deleteNoteAction(projectId, id)),
      uploadDocument: (file, category) => uploadDocument(projectId, file, category),
      openDocument: (id) => openDocument(projectId, id),
      deleteDocument: (id) => safe(() => deleteDocumentAction(projectId, id)),
      async uploadPhotos({ files, captions, stage, takenOn, onProgress }) {
        try {
          const prepared = await preparePhotosAction(projectId, files.length);
          if (!prepared.ok) return outcome(prepared);
          const { resizeForUpload } = await import('@/lib/bonimos/resize');
          const storage = (await browserStorage()).from('bonimos-photos');
          const uploaded: Array<{ id: string; width: number; height: number; caption: string | null }> = [];
          let done = 0;
          onProgress?.(0, files.length);
          for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            const slot = prepared.slots[i];
            try {
              const { photo, thumb } = await resizeForUpload(file);
              const opts = { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' };
              const [a, b] = await Promise.all([storage.upload(slot.path, photo.blob, opts), storage.upload(slot.thumbPath, thumb.blob, opts)]);
              if (!a.error && !b.error) uploaded.push({ id: slot.id, width: photo.width, height: photo.height, caption: captions[i]?.trim() || null });
            } catch {
              // An undecodable file is skipped; the rest still upload.
            }
            onProgress?.((done += 1), files.length);
          }
          if (!uploaded.length) return { ok: false, message: 'לא הצלחנו לקרוא את התמונות. נסו JPG או PNG.' };
          const reg = await registerPhotosAction(projectId, { stage, takenOn, photos: uploaded });
          if (!reg.ok) return outcome(reg);
          const skipped = files.length - reg.added;
          return { ok: true, added: reg.added, message: skipped > 0 ? `${skipped} תמונות לא עלו. נסו אותן שוב.` : undefined };
        } catch {
          return NETWORK_ERROR;
        }
      },
      deletePhoto: (id) => safe(() => deletePhotoAction(projectId, id)),
    }),
    [projectId],
  );
  return (
    <ToastProvider>
      <BonimosActionsProvider value={actions}>{children}</BonimosActionsProvider>
    </ToastProvider>
  );
}
