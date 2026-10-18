'use client';

/**
 * Under a finished answer: 👍/👎 (with an optional reason) and sharing.
 * "שתפו בוואטסאפ" and "העתיקו קישור" create the read-only snapshot
 * /ask/a/<id>/ the first time (opt-in: nothing is stored until then) and reuse
 * its id after that. The id is made in the browser so the WhatsApp tab opens
 * inside the tap.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Link2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { SocialIcon } from '@/components/ui/SocialIcon';
import { chipClasses } from '@/components/ui/Chip';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';
import { advisorName } from '@/lib/nav';
import { newShareId, publishShare, shareMessage, shareUrl, whatsappShareHref } from '@/lib/advisor/client/share';
import type { AdvisorSharePayload } from '@/lib/advisor/types';

const REASONS = ['לא ענה על השאלה', 'מידע לא מדויק', 'חסר פירוט', 'אחר'];
/** A 👎 without a reason is sent after this long (or when the answer goes away). */
const REASON_GRACE_MS = 15_000;

export function FeedbackBar({
  value,
  onChange,
  query,
  turn,
  conversationId,
}: {
  value?: 'up' | 'down';
  onChange: (v: 'up' | 'down') => void;
  query: string;
  turn?: number;
  conversationId?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [thanked, setThanked] = useState(false);
  // One answer_feedback per rating: a 👎 waits briefly for its reason.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; send: (reason?: string) => void } | null>(null);
  const turnProps = { ...(turn ? { turn } : {}), ...(conversationId ? { conversation_id: conversationId } : {}) };

  useEffect(() => () => pending.current?.send(), []);

  const rate = (v: 'up' | 'down') => {
    if (value === v) return;
    pending.current?.send();
    onChange(v);
    setThanked(false);
    if (v === 'up') {
      setAsking(false);
      track('answer_feedback', { helpful: true, query, ...turnProps });
      return;
    }
    setAsking(true);
    const send = (reason?: string) => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      pending.current = null;
      track('answer_feedback', { helpful: false, query, ...(reason ? { reason } : {}), ...turnProps });
    };
    pending.current = { timer: setTimeout(() => send(), REASON_GRACE_MS), send };
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <span className="me-1 text-caption text-ink-500">עזר לכם?</span>
        <IconButton label="כן, התשובה עזרה" icon={<ThumbsUp />} size="sm" variant={value === 'up' ? 'secondary' : 'ghost'} aria-pressed={value === 'up'} onClick={() => rate('up')} />
        <IconButton label="לא, התשובה לא עזרה" icon={<ThumbsDown />} size="sm" variant={value === 'down' ? 'secondary' : 'ghost'} aria-pressed={value === 'down'} onClick={() => rate('down')} />
        {value === 'up' && <span className="ms-1 text-caption text-ink-600">תודה!</span>}
      </div>
      {value === 'down' && asking && (
        <div role="group" aria-label="מה היה חסר?" className="flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className={chipClasses({ size: 'sm' })}
              onClick={() => {
                pending.current?.send(r);
                setAsking(false);
                setThanked(true);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {value === 'down' && thanked && <p className="text-caption text-ink-600">תודה, זה עוזר לנו לשפר את התשובות.</p>}
    </div>
  );
}

export function ShareBar({
  payload,
  signature,
  shareId,
  onShareId,
  turn,
  conversationId,
}: {
  payload: AdvisorSharePayload;
  signature: string;
  shareId?: string;
  onShareId: (id: string) => void;
  turn?: number;
  conversationId?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const ensure = (): { id: string; url: string } => {
    const id = shareId ?? newShareId();
    if (!shareId) {
      onShareId(id);
      void publishShare(id, payload, signature);
    }
    return { id, url: shareUrl(id, window.location.origin) };
  };
  const turnProps = { ...(turn ? { turn } : {}), ...(conversationId ? { conversation_id: conversationId } : {}) };

  const toWhatsapp = () => {
    const { id, url } = ensure();
    track('answer_shared', { channel: 'whatsapp', share_id: id, query: payload.question, ...turnProps });
    window.open(whatsappShareHref(shareMessage(payload.question, payload.answer, url, advisorName())), '_blank', 'noopener,noreferrer');
  };

  const copy = async () => {
    const { id, url } = ensure();
    track('answer_shared', { channel: 'copy', share_id: id, query: payload.question, ...turnProps });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt('העתיקו את הקישור:', url);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toWhatsapp}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-whatsapp px-4 text-sm font-semibold text-ink-950 transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"
      >
        <SocialIcon id="whatsapp" className="size-[1.125rem]" />
        שתפו בוואטסאפ
      </button>
      <button
        type="button"
        onClick={copy}
        aria-live="polite"
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
          copied ? 'border-success-600 bg-success-50 text-success-700' : 'border-ink-200 bg-white text-ink-800 hover:border-primary-600 hover:text-primary-700',
        )}
      >
        {copied ? <Check aria-hidden="true" className="size-4" /> : <Link2 aria-hidden="true" className="size-4" />}
        {copied ? 'הקישור הועתק' : 'העתיקו קישור'}
      </button>
    </div>
  );
}
