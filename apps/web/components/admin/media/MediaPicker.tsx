'use client';

import { useEffect, useRef } from 'react';
import MediaBrowser from './MediaBrowser';

/** Modal media picker. Renders nothing while closed. */
export default function MediaPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, name: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} className="w-[min(96vw,64rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/40" dir="rtl">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 className="text-lg font-semibold">ספריית מדיה</h2>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100" aria-label="סגירה">
          ✕
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-5">
        {open && (
          <MediaBrowser
            compact
            onSelect={(url, name) => {
              onSelect(url, name);
              onClose();
            }}
          />
        )}
      </div>
    </dialog>
  );
}
