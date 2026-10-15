'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { DealResult } from '@/lib/revenue/actions/portal';

/**
 * "סגרנו עסקה": the partner marks a lead as a closed deal, with an optional
 * value. Without an action (the demo) it only shows the result locally.
 */
export default function DealButton({
  businessId,
  leadId,
  action,
}: {
  businessId: string;
  leadId: string | null;
  action?: (fd: FormData) => Promise<DealResult>;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DealResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (result?.ok) return <p className="text-sm font-semibold text-success-700">{result.message}</p>;
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" iconStart={<Handshake />} onClick={() => setOpen(true)}>
        סגרנו עסקה
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = action ? await action(fd) : { ok: true, message: 'נרשם (תצוגת הדגמה: לא נשמר).' };
          setResult(res);
          if (res.ok && action) router.refresh();
        });
      }}
    >
      <input type="hidden" name="business_id" value={businessId} />
      {leadId && <input type="hidden" name="lead_id" value={leadId} />}
      <label className="text-xs text-ink-600">
        <span className="mb-1 block">סכום העסקה (₪, רשות)</span>
        <input
          name="value_nis"
          inputMode="numeric"
          dir="ltr"
          className="h-9 w-32 rounded-lg border border-ink-200 px-2 text-end text-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/15"
        />
      </label>
      <Button type="submit" size="sm" loading={pending} disabled={pending}>
        שמירה
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        ביטול
      </Button>
      {result && !result.ok && <p className="w-full text-xs text-danger-700">{result.message}</p>}
    </form>
  );
}
