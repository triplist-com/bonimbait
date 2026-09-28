'use client';

import { useState } from 'react';
import MediaPicker from './MediaPicker';

type Img = { url: string; alt?: string | null };

/** Ordered image list (URL + alt), submitted as JSON in `name`. */
export default function GalleryField({ name, defaultValue }: { name: string; defaultValue: Img[] }) {
  const [items, setItems] = useState<Img[]>(defaultValue);
  const [open, setOpen] = useState(false);
  const move = (i: number, d: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.length === 0 && <p className="text-sm text-gray-500">אין תמונות בגלריה.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((img, i) => (
          <li key={`${img.url}-${i}`} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="aspect-[4/3] w-full bg-gray-100 object-cover" loading="lazy" />
            <div className="space-y-1 p-2">
              <input
                value={img.alt ?? ''}
                onChange={(e) => setItems((prev) => prev.map((p, k) => (k === i ? { ...p, alt: e.target.value } : p)))}
                placeholder="טקסט חלופי"
                aria-label="טקסט חלופי"
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
              />
              <div className="flex justify-between text-xs">
                <span className="flex gap-2">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-600 disabled:opacity-30" aria-label="הזזה קדימה">
                    →
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-gray-600 disabled:opacity-30" aria-label="הזזה אחורה">
                    ←
                  </button>
                </span>
                <button type="button" onClick={() => setItems((prev) => prev.filter((_, k) => k !== i))} className="text-red-700 hover:underline">
                  הסרה
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
        + הוספת תמונה
      </button>
      <MediaPicker open={open} onClose={() => setOpen(false)} onSelect={(url) => setItems((prev) => [...prev, { url, alt: null }])} />
    </div>
  );
}
