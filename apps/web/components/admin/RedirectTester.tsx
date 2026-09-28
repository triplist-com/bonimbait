'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/admin/guard';

type Result = { status: number; location: string | null; error?: string };

function safeDecode(v: string): string {
  try {
    return decodeURI(v);
  } catch {
    return v;
  }
}

/** "Test" button: requests the source path and shows the status + Location. */
export default function RedirectTester({ path, expected, test }: { path: string; expected?: string; test: (path: string) => Promise<ActionResult<Result>> }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  let verdict: { ok: boolean; text: string } | null = null;
  if (res) {
    if (res.status === 0) verdict = { ok: false, text: `שגיאה: ${res.error ?? 'אין חיבור'}` };
    else if (res.status >= 300 && res.status < 400) {
      const loc = safeDecode(res.location ?? '');
      const matches = expected ? loc.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') === safeDecode(expected).replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || loc === expected : true;
      verdict = { ok: matches, text: `${res.status} ← ${loc}` };
    } else verdict = { ok: false, text: `${res.status} (אין הפניה)` };
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await test(path);
            if (r.ok && r.data) {
              setRes(r.data);
              setErr(null);
            } else setErr(r.ok ? 'אין תשובה' : r.error);
          })
        }
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? 'בודק…' : 'בדיקה'}
      </button>
      {verdict && (
        <span dir="ltr" className={`text-xs ${verdict.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {verdict.ok ? '✓ ' : '✗ '}
          {verdict.text}
        </span>
      )}
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}
