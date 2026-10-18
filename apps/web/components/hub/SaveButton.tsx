'use client';

/**
 * ♡ for videos, articles and answers: "שמירה" into "הבית שלי". Members save
 * to their project; anonymous visitors save on this device and get a gentle
 * "התחברו כדי לשמור לתמיד". Emits hub_item_saved (and shortlist_add for pros
 * through ShortlistButton).
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';
import type { SavedKind } from '@/lib/hub/types';
import { buttonClasses } from '@/components/ui/Button';
import { toggleSaved, useSaved } from './savedStore';

export type SaveHint = 'device' | 'account' | 'error' | null;

/** The small note under a save button. */
export function SaveNote({ hint, message, onClose }: { hint: SaveHint; message?: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(onClose, hint === 'device' ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [hint, onClose]);
  if (!hint) return null;
  const next = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/my-home/';
  return (
    <span
      role="status"
      className="absolute end-0 top-full z-20 mt-2 w-max max-w-[16rem] rounded-xl bg-ink-900 px-3 py-2 text-caption font-medium leading-snug text-white shadow-lift motion-safe:animate-slide-down"
    >
      {hint === 'error' && (message || 'לא הצלחנו לשמור. נסו שוב.')}
      {hint === 'account' && (
        <>
          נשמר ב
          <Link href="/my-home/#saved" prefetch={false} className="font-bold underline underline-offset-2">
            הבית שלי
          </Link>
        </>
      )}
      {hint === 'device' && (
        <>
          נשמר במכשיר הזה.{' '}
          <Link href={`/login/?next=${encodeURIComponent(next)}`} prefetch={false} className="font-bold text-primary-200 underline underline-offset-2">
            התחברו
          </Link>{' '}
          כדי לשמור לתמיד.
        </>
      )}
    </span>
  );
}

export default function SaveButton({
  kind,
  refId,
  title,
  meta,
  className,
  size = 'sm',
  prepare,
  label = 'שמירה',
  savedLabel = 'נשמר',
}: {
  kind: Exclude<SavedKind, 'business'>;
  refId: string;
  title: string;
  meta?: Record<string, string>;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * Runs before the first save and returns the ref to store (null = failed),
   * e.g. an advisor answer publishes its snapshot and saves its share id.
   */
  prepare?: () => Promise<string | null>;
  label?: string;
  savedLabel?: string;
}) {
  const { saved, ready } = useSaved(kind, refId);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<SaveHint>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    const next = !saved;
    setBusy(true);
    const ref = !saved && prepare ? await prepare().catch(() => null) : refId;
    if (!ref) {
      setBusy(false);
      setMessage(null);
      setHint('error');
      return;
    }
    const res = await toggleSaved({ kind, ref, title, meta }, next);
    setBusy(false);
    if (!res.ok) {
      setMessage(res.message);
      setHint('error');
      return;
    }
    if (next) {
      track('hub_item_saved', { item_type: kind, item_id: ref });
      setHint(res.where);
    } else {
      setHint(null);
    }
  }

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={ready ? saved : undefined}
        disabled={!ready}
        className={cn(
          buttonClasses({ variant: saved ? 'secondary' : 'outline', size }),
          'disabled:opacity-60',
        )}
      >
        {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        {saved ? savedLabel : label}
      </button>
      <SaveNote hint={hint} message={message} onClose={() => setHint(null)} />
    </span>
  );
}
