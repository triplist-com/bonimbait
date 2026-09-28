'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/admin/guard';

type Row = { id: string; name: string; city: string | null; specialty: string; is_featured: boolean };

/**
 * Live listing order of /recommended/ (the only ranking signal on the live
 * site). Drag rows, or type a new position, then save.
 */
export default function RankingList({ rows, save }: { rows: Row[]; save: (ids: string[]) => Promise<ActionResult> }) {
  const [items, setItems] = useState(rows);
  const [drag, setDrag] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
    setDirty(true);
    setMsg(null);
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-card backdrop-blur">
        <p className="text-sm text-gray-600">
          גררו שורה, או שנו את המספר בעמודה &quot;מיקום&quot;. {dirty && <strong className="text-amber-700">יש שינויים שלא נשמרו.</strong>}
        </p>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const res = await save(items.map((i) => i.id));
              setMsg(res.ok ? { ok: true, text: res.message ?? 'נשמר.' } : { ok: false, text: res.error });
              if (res.ok) {
                setDirty(false);
                router.refresh();
              }
            })
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'שומר…' : 'שמירת הסדר'}
        </button>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-card">
        {items.map((it, i) => (
          <li
            key={it.id}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag !== null) moveTo(drag, i);
              setDrag(null);
            }}
            className={`flex cursor-grab items-center gap-3 px-3 py-2 text-sm ${drag === i ? 'bg-primary-50' : ''}`}
          >
            <span aria-hidden className="text-gray-400">
              ⋮⋮
            </span>
            <input
              type="number"
              min={1}
              max={items.length}
              aria-label={`מיקום של ${it.name}`}
              defaultValue={i + 1}
              key={`${it.id}-${i}`}
              onBlur={(e) => moveTo(i, Math.max(1, Math.min(items.length, Number(e.target.value) || i + 1)) - 1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-center"
            />
            <span className="flex-1 font-medium text-gray-900">
              {it.name} {it.is_featured && <span className="ms-1 rounded bg-amber-100 px-1.5 text-xs text-amber-800">מומלץ</span>}
            </span>
            <span className="hidden w-48 truncate text-gray-500 md:inline">{it.specialty}</span>
            <span className="hidden w-32 truncate text-gray-500 lg:inline">{it.city ?? ''}</span>
            <span className="flex gap-1">
              <button type="button" className="rounded px-1.5 text-gray-500 hover:bg-gray-100" onClick={() => moveTo(i, i - 1)} aria-label="למעלה">
                ▲
              </button>
              <button type="button" className="rounded px-1.5 text-gray-500 hover:bg-gray-100" onClick={() => moveTo(i, i + 1)} aria-label="למטה">
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
