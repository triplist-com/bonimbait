'use client';

import { useState } from 'react';
import { inputClass } from '../FormField';
import MediaPicker from './MediaPicker';

/** Image URL input with preview and a media-library picker. Submits `name`. */
export default function ImageField({
  name,
  defaultValue,
  id,
}: {
  name: string;
  defaultValue?: string | null;
  id?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input id={id} name={name} value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" className={inputClass} placeholder="https://…" />
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm hover:bg-gray-50">
          בחירה
        </button>
        {url && (
          <button type="button" onClick={() => setUrl('')} className="shrink-0 rounded-lg border border-gray-300 px-3 text-sm text-red-700 hover:bg-red-50">
            הסרה
          </button>
        )}
      </div>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-40 rounded-lg border border-gray-200 object-contain" />
      )}
      <MediaPicker open={open} onClose={() => setOpen(false)} onSelect={(u) => setUrl(u)} />
    </div>
  );
}
