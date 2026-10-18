'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import type { ActionResult } from '@/lib/admin/guard';
import { publishSource, restoreSource, skipSource, unpublishSource } from '@/lib/admin/actions/autopilot';
import { ACTION_LABELS, availableActions } from '@/lib/autopilot/status';
import type { SourceStatus } from '@/lib/autopilot/types';

type ProcessResponse = { ok?: boolean; message?: string; error?: string; next?: 'index' } | null;

/** POST /api/admin/autopilot/process (shared with TranscriptForm). */
export async function requestProcess(id: string): Promise<ProcessResponse> {
  const res = await fetch('/api/admin/autopilot/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return (await res.json().catch(() => null)) as ProcessResponse;
}

function withId(id: string, fd: FormData = new FormData()): FormData {
  fd.set('id', id);
  return fd;
}

const BTN = 'rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:opacity-60';
const PRIMARY = `${BTN} bg-primary text-white shadow-sm hover:bg-primary-700`;
const SECONDARY = `${BTN} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

/**
 * Row/detail actions for a knowledge source. Processing calls the route
 * handler (up to a minute); the quick state changes are server actions.
 */
export default function SourceActions({
  id,
  status,
  updatedAt,
  title,
  showTranscriptLink = true,
}: {
  id: string;
  status: SourceStatus;
  updatedAt: string;
  title: string;
  showTranscriptLink?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const actions = availableActions(status, updatedAt);

  async function processNow(label: string) {
    setBusy(label);
    setMessage(null);
    try {
      let data = await requestProcess(id);
      // The server stopped after the transcript to stay within its time budget: continue once.
      if (data?.ok && data.next === 'index') {
        setMessage({ ok: true, text: data.message ?? 'ממשיכים…' });
        data = await requestProcess(id);
      }
      setMessage(data?.ok ? { ok: true, text: data.message ?? 'העיבוד הסתיים.' } : { ok: false, text: data?.error ?? 'העיבוד נכשל.' });
    } catch {
      setMessage({ ok: false, text: 'החיבור נקטע. רעננו את הדף כדי לראות את המצב.' });
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function quick(label: string, action: (fd: FormData) => Promise<ActionResult<unknown>>) {
    setBusy(label);
    setMessage(null);
    const res = await action(withId(id));
    setBusy(null);
    setMessage(res.ok ? { ok: true, text: res.message ?? 'עודכן.' } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  if (actions.length === 0) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-info-700" aria-live="polite">
        <span className="h-2 w-2 animate-pulse rounded-full bg-info-500 motion-reduce:animate-none" aria-hidden="true" />
        בעיבוד…
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`פעולות: ${title}`}>
        {actions.map((a) => {
          switch (a) {
            case 'process':
            case 'retry':
              return (
                <button key={a} type="button" disabled={!!busy} onClick={() => processNow(a)} aria-busy={busy === a} className={a === 'process' ? PRIMARY : SECONDARY}>
                  {busy === a ? 'מעבד… (עד דקה)' : ACTION_LABELS[a]}
                </button>
              );
            case 'transcript':
              return showTranscriptLink ? (
                <Link key={a} href={`/admin/autopilot/${id}/#transcript`} className={SECONDARY}>
                  {ACTION_LABELS[a]}
                </Link>
              ) : null;
            case 'skip':
              return (
                <button key={a} type="button" disabled={!!busy} onClick={() => quick(a, skipSource)} className={SECONDARY}>
                  {busy === a ? '…' : ACTION_LABELS[a]}
                </button>
              );
            case 'restore':
              return (
                <button key={a} type="button" disabled={!!busy} onClick={() => quick(a, restoreSource)} className={SECONDARY}>
                  {busy === a ? '…' : ACTION_LABELS[a]}
                </button>
              );
            case 'publish':
              return (
                <ConfirmDialog
                  key={a}
                  trigger={ACTION_LABELS[a]}
                  triggerClassName={PRIMARY}
                  tone="primary"
                  title="לפרסם את הסרטון באתר?"
                  body={
                    <>
                      <strong>{title}</strong> יקבל עמוד באתר, ייכנס למפת האתר ויופיע בחיפוש ובתשובות ה-AI.
                    </>
                  }
                  confirmLabel="פרסום"
                  onConfirm={(fd) => publishSource(withId(id, fd))}
                />
              );
            case 'unpublish':
              return (
                <ConfirmDialog
                  key={a}
                  trigger={ACTION_LABELS[a]}
                  title="להסיר את הסרטון מהאתר?"
                  body="העמוד יוסר, והסרטון לא יופיע יותר בחיפוש ובתשובות. אפשר לפרסם שוב בכל רגע."
                  confirmLabel="הסרה"
                  onConfirm={(fd) => unpublishSource(withId(id, fd))}
                />
              );
            default:
              return null;
          }
        })}
      </div>
      <p aria-live="polite" className={`max-w-xs text-xs empty:hidden ${message?.ok === false ? 'text-danger-700' : 'text-success-700'}`}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}
