'use client';

/**
 * "לרשימה הקצרה": shortlist a pro (hub_saved_items kind 'business' for
 * members, bb.shortlist for anonymous visitors). Emits shortlist_add and
 * hub_item_saved. `compact` is the icon-only version for directory cards.
 */
import { useState } from 'react';
import { UserRoundCheck, UserRoundPlus } from 'lucide-react';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { iconButtonClasses } from '@/components/ui/IconButton';
import { SaveNote, type SaveHint } from './SaveButton';
import { toggleSaved, useSaved } from './savedStore';

export default function ShortlistButton({
  businessId,
  slug,
  name,
  specialty,
  source,
  compact = false,
  className,
}: {
  businessId: string;
  slug: string;
  name: string;
  specialty?: string | null;
  /** Where the button sits, for analytics: 'business_page' | 'business_card'. */
  source: string;
  compact?: boolean;
  className?: string;
}) {
  const { saved, ready } = useSaved('business', businessId);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<SaveHint>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    const next = !saved;
    setBusy(true);
    const meta: Record<string, string> = { slug };
    if (specialty) meta.specialty = specialty;
    const res = await toggleSaved({ kind: 'business', ref: businessId, title: name, meta }, next);
    setBusy(false);
    if (!res.ok) {
      setMessage(res.message);
      setHint('error');
      return;
    }
    if (next) {
      track('shortlist_add', { business_id: businessId, specialty: specialty ?? undefined, source });
      track('hub_item_saved', { item_type: 'business', item_id: businessId });
      setHint(res.where);
    } else {
      setHint(null);
    }
  }

  const label = saved ? `${name} ברשימה הקצרה שלכם` : `הוספת ${name} לרשימה הקצרה`;
  return (
    <span className={cn('relative inline-flex', className)}>
      {compact ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={ready ? saved : undefined}
          aria-label={label}
          title={label}
          disabled={!ready}
          className={cn(iconButtonClasses({ variant: saved ? 'secondary' : 'outline', size: 'sm', round: true }), 'disabled:opacity-60')}
        >
          <span aria-hidden="true" className="contents">
            {saved ? <UserRoundCheck /> : <UserRoundPlus />}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={ready ? saved : undefined}
          disabled={!ready}
          className={cn(buttonClasses({ variant: saved ? 'secondary' : 'outline', size: 'lg' }), 'disabled:opacity-60')}
        >
          {saved ? <UserRoundCheck aria-hidden="true" /> : <UserRoundPlus aria-hidden="true" />}
          {saved ? 'ברשימה הקצרה' : 'לרשימה הקצרה'}
        </button>
      )}
      <SaveNote hint={hint} message={message} onClose={() => setHint(null)} />
    </span>
  );
}
