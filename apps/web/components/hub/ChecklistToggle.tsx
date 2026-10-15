'use client';

import { useEffect, useId, useState, useTransition, type ReactNode } from 'react';
import { track } from '@/lib/analytics/track';
import { onHubStorageChange, readChecklist } from '@/lib/hub/local';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { useHubActions } from './HubActions';

/**
 * A ticked roadmap item. Optimistic: the box flips at once and rolls back
 * with a toast if saving fails. Members' ticks are tracked by the server
 * action; local visitors' ticks are tracked here.
 */
export function ChecklistToggle({
  itemId,
  stage,
  checked,
  title,
  description,
  className,
}: {
  itemId: string;
  stage: string;
  checked: boolean;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [value, setValue] = useState(checked);
  const [pending, startTransition] = useTransition();
  const descId = useId();

  useEffect(() => setValue(checked), [checked]);

  // Local mode: the server rendered the page without this browser's ticks.
  useEffect(() => {
    if (actions.mode !== 'local') return;
    const sync = () => setValue(readChecklist().includes(itemId));
    sync();
    return onHubStorageChange(sync);
  }, [actions.mode, itemId]);

  function onChange(next: boolean) {
    setValue(next);
    startTransition(async () => {
      const res = await actions.toggleChecklist(itemId, next);
      if (!res.ok) {
        setValue(!next);
        toast({ title: res.message ?? 'לא הצלחנו לשמור. נסו שוב.', tone: 'error' });
        return;
      }
      if (next && actions.mode === 'local') track('hub_checklist_item_done', { stage, item_id: itemId });
    });
  }

  return (
    <label className={cn('group flex cursor-pointer items-start gap-3', pending && 'opacity-80', className)}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? descId : undefined}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      />
      <span className="min-w-0">
        <span className={cn('block text-body-sm font-semibold text-ink-900 transition-colors', value && 'text-ink-500 line-through decoration-ink-300')}>
          {title}
        </span>
        {description && (
          <span id={descId} className="mt-0.5 block text-caption text-ink-600">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
