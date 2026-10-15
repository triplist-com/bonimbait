'use client';

/**
 * "השיחות שלי": recent advisor conversations. Anonymous visitors see the ones
 * kept in this browser; signed-in members also see their saved threads from
 * the DB (GET /api/advisor/threads, RLS owner-only), deduplicated by id.
 */
import { useEffect, useState } from 'react';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useAuthState } from '@/lib/hooks/useAuthState';
import { whenLabel } from '@/lib/advisor/format';
import { deleteThread, listThreads, type StoredThread } from '@/lib/advisor/client/storage';

interface ThreadRow {
  id: string;
  title: string;
  updatedAt: string;
  turns: number;
  local?: StoredThread;
  remote?: boolean;
}

export interface ThreadsSheetProps {
  open: boolean;
  onClose: () => void;
  currentId?: string;
  onOpen: (thread: StoredThread) => void;
}

async function fetchRemoteThread(id: string): Promise<StoredThread | null> {
  try {
    const res = await fetch(`/api/advisor/threads/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return ((await res.json()) as { thread?: StoredThread }).thread ?? null;
  } catch {
    return null;
  }
}

export default function ThreadsSheet({ open, onClose, currentId, onOpen }: ThreadsSheetProps) {
  const auth = useAuthState();
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const local: ThreadRow[] = listThreads().map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt, turns: t.turns.length, local: t }));
    setRows(local);
    if (auth !== 'signed-in') return;
    let cancelled = false;
    fetch('/api/advisor/threads', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((data: { threads?: Array<{ id: string; title: string; turn_count: number; updated_at: string }> }) => {
        if (cancelled) return;
        const byId = new Map(local.map((r) => [r.id, r]));
        for (const t of data.threads ?? []) {
          if (!byId.has(t.id)) byId.set(t.id, { id: t.id, title: t.title, updatedAt: t.updated_at, turns: t.turn_count, remote: true });
        }
        setRows(Array.from(byId.values()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, auth]);

  const openRow = async (row: ThreadRow) => {
    if (row.local) {
      onOpen(row.local);
      onClose();
      return;
    }
    setLoadingId(row.id);
    const thread = await fetchRemoteThread(row.id);
    setLoadingId(null);
    if (thread) {
      onOpen(thread);
      onClose();
    }
  };

  const remove = async (row: ThreadRow) => {
    deleteThread(row.id);
    if (auth === 'signed-in') void fetch(`/api/advisor/threads/${row.id}`, { method: 'DELETE' }).catch(() => undefined);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  };

  return (
    <Sheet open={open} onClose={onClose} title="השיחות שלי" description={auth === 'signed-in' ? 'השיחות נשמרות בחשבון שלכם.' : 'השיחות נשמרות בדפדפן הזה. התחברו כדי לשמור אותן בחשבון.'}>
      {rows.length === 0 ? (
        <EmptyState icon={<MessageSquareText />} title="עוד אין שיחות" description="שאלו שאלה ראשונה, והשיחה תחכה לכם כאן." />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openRow(row)}
                aria-current={row.id === currentId ? 'true' : undefined}
                disabled={loadingId === row.id}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-start transition-colors hover:border-primary-300 hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 aria-[current=true]:border-primary-600"
              >
                <span className="line-clamp-2 text-sm font-semibold text-ink-900">{row.title}</span>
                <span className="text-caption text-ink-500">
                  {whenLabel(row.updatedAt)}
                  {row.turns > 1 ? ` · ${row.turns} שאלות` : ''}
                </span>
              </button>
              <IconButton label={`מחיקת השיחה: ${row.title}`} icon={<Trash2 />} size="sm" onClick={() => remove(row)} />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
