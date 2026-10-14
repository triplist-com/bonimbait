'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Report {
  inserted: Array<{ title: string }>;
  alreadyKnown: number;
  inStaticIndex: number;
  feeds: Array<{ kind: string; items: number; error?: string }>;
}

/** "Check channel now": runs detection (RSS) as the signed-in staff member. */
export default function CheckChannelButton({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/autopilot/check', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; report?: Report } | null;
      if (!res.ok || !data?.ok || !data.report) {
        setMessage({ ok: false, text: data?.error ?? 'הבדיקה נכשלה. נסו שוב.' });
        return;
      }
      const r = data.report;
      const feedError = r.feeds.find((f) => f.error);
      const n = r.inserted.length;
      const text =
        n > 0
          ? `נמצאו ${n} סרטונים חדשים והם נוספו לתור.`
          : `אין סרטונים חדשים: ${r.alreadyKnown + r.inStaticIndex} הסרטונים האחרונים בערוץ כבר במערכת.`;
      setMessage({ ok: !feedError, text: feedError ? `${text} (תקלה בקריאת הפיד: ${feedError.error})` : text });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: 'אין חיבור לשרת. נסו שוב.' });
    } finally {
      setBusy(false);
    }
  }

  const pad = size === 'lg' ? 'px-5 py-2.5 text-base' : 'px-4 py-2 text-sm';
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className={`inline-flex items-center gap-2 rounded-lg bg-primary font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:opacity-60 ${pad}`}
      >
        <svg className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
        {busy ? 'בודק את הערוץ…' : 'בדיקת הערוץ עכשיו'}
      </button>
      <p aria-live="polite" className={`text-sm empty:hidden ${message?.ok === false ? 'text-red-700' : 'text-emerald-700'}`}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}
