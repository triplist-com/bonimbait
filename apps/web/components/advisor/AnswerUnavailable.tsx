import { Hourglass, TimerReset } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AdvisorDegraded } from '@/lib/advisor/types';

/** Degraded answers that are about availability, not about the question. */
export function isUnavailable(degraded: AdvisorDegraded | undefined | null): boolean {
  return degraded === 'budget' || degraded === 'disabled' || degraded === 'rate_limited';
}

/** The server's message leads with what happened (the title); the rest says what to do. */
export function splitNotice(message: string): { title: string; body: string } {
  const text = message.trim();
  const cut = text.indexOf('. ');
  return cut > 0 ? { title: text.slice(0, cut + 1), body: text.slice(cut + 2).trim() } : { title: text, body: '' };
}

/**
 * The written answer is off (daily AI budget, kill switch) or the visitor is
 * asking too fast. The server's message says what to do; this gives it the
 * brand's calm look instead of an answer-shaped paragraph. The moments and
 * articles still show under it (retrieval needs no model).
 */
export default function AnswerUnavailable({
  degraded,
  message,
  className,
}: {
  degraded: AdvisorDegraded;
  message: string;
  className?: string;
}) {
  const Icon = degraded === 'rate_limited' ? TimerReset : Hourglass;
  const { title, body } = splitNotice(message);
  return (
    <div role="status" className={cn('flex gap-3.5 rounded-2xl bg-sand-50 p-4 ring-1 ring-inset ring-sand-200 sm:p-5', className)}>
      <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-xs ring-1 ring-sand-200">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-title-sm text-ink-900">{title}</p>
        {body && <p className="mt-1 text-body-sm text-ink-700">{body}</p>}
      </div>
    </div>
  );
}
