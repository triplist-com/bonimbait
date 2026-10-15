'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type Result = { ok: boolean; message?: string; topics?: number; costUsd?: number };

/**
 * "רענון תובנות": runs the content-gap engine once (POST
 * /api/admin/insights/refresh, about 10-30 seconds), then reloads the page's
 * server data. The route enforces the role, the AI budget and a cooldown.
 */
export default function RefreshInsightsButton({ label = 'רענון תובנות' }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/insights/refresh', { method: 'POST', headers: { 'content-type': 'application/json' } });
      const body = (await res.json().catch(() => ({}))) as Result;
      if (body.ok) {
        const cost = typeof body.costUsd === 'number' ? ` · עלות $${body.costUsd.toFixed(4)}` : '';
        setMessage({ tone: 'ok', text: `${body.message ?? 'התובנות עודכנו.'}${cost}` });
        startTransition(() => router.refresh());
      } else {
        setMessage({ tone: 'error', text: body.message ?? 'הרענון נכשל. נסו שוב בעוד כמה דקות.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'אין חיבור לשרת. נסו שוב.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={run} loading={busy} iconStart={busy ? undefined : <RefreshCw />} size="md">
        {busy ? 'מנתחים את השאלות…' : label}
      </Button>
      <p aria-live="polite" className={message?.tone === 'error' ? 'text-sm text-danger-700' : 'text-sm text-ink-600'}>
        {message?.text ?? (busy ? 'קיבוץ השאלות, בדיקה מול התוכן וניסוח הכותרות. לוקח עד חצי דקה.' : '')}
      </p>
    </div>
  );
}
