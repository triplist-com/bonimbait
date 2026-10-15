'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { NotebookPen } from 'lucide-react';
import { cn } from '@/lib/cn';

const STORAGE_KEY = 'bb.tour.notes';

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Wraps the tour beats and shows or hides the presenter notes inside them
 * (elements with `hidden group-data-[notes=on]/tour:block`). Off by default,
 * remembered per browser; "N" toggles it while presenting.
 */
export default function TourNotes({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(readStored());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // Private mode or blocked storage: the toggle still works for this visit.
    }
  }, [on]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N' && e.key !== 'מ') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      setOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div data-notes={on ? 'on' : 'off'} className="group/tour">
      <div className="sticky top-[6.5rem] z-30 md:top-[4.25rem]">
        <div className="container-page flex justify-end py-2">
          <div className="flex items-center gap-2 rounded-full bg-white/95 p-1 shadow-lift ring-1 ring-ink-900/5 backdrop-blur">
            {toolbar}
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setOn((v) => !v)}
              title="קיצור מקלדת: N"
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
                on ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100',
              )}
            >
              <NotebookPen aria-hidden="true" className="size-4" />
              הערות למציג
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
