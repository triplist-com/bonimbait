'use client';

import { useState } from 'react';
import MediaPicker from './MediaPicker';

type Img = { url: string; alt?: string | null };
type Group = { name: string; images: Img[] };

/** Stored gallery JSON -> editable groups. Accepts flat [{url, alt}] and migrated [{name, images: [url]}]. */
export function galleryToGroups(value: unknown): { grouped: boolean; groups: Group[] } {
  if (!Array.isArray(value) || value.length === 0) return { grouped: false, groups: [{ name: '', images: [] }] };
  const isGroup = (v: unknown) => !!v && typeof v === 'object' && Array.isArray((v as { images?: unknown }).images);
  if (value.some(isGroup)) {
    return {
      grouped: true,
      groups: value.filter(isGroup).map((g) => {
        const grp = g as { name?: unknown; images: unknown[] };
        return {
          name: typeof grp.name === 'string' ? grp.name : '',
          images: grp.images.flatMap((i) =>
            typeof i === 'string' ? [{ url: i }] : i && typeof i === 'object' && typeof (i as Img).url === 'string' ? [i as Img] : [],
          ),
        };
      }),
    };
  }
  return {
    grouped: false,
    groups: [{ name: '', images: value.filter((i): i is Img => !!i && typeof i === 'object' && typeof (i as Img).url === 'string') }],
  };
}

function serialize(grouped: boolean, groups: Group[]): string {
  if (grouped) return JSON.stringify(groups.map((g) => ({ name: g.name, images: g.images.map((i) => i.url) })));
  return JSON.stringify(groups.flatMap((g) => g.images.map((i) => ({ url: i.url, alt: i.alt ?? null }))));
}

/**
 * Image gallery editor, submitted as JSON in `name`. Keeps the stored shape:
 * migrated listings have named groups (albums), new ones a flat list.
 */
export default function GalleryField({ name, defaultValue }: { name: string; defaultValue: unknown }) {
  const initial = galleryToGroups(defaultValue);
  const [grouped] = useState(initial.grouped);
  const [groups, setGroups] = useState<Group[]>(initial.groups);
  const [target, setTarget] = useState<number | null>(null);

  const update = (gi: number, fn: (g: Group) => Group) => setGroups((prev) => prev.map((g, k) => (k === gi ? fn(g) : g)));
  const move = (gi: number, i: number, d: -1 | 1) =>
    update(gi, (g) => {
      const j = i + d;
      if (j < 0 || j >= g.images.length) return g;
      const images = [...g.images];
      [images[i], images[j]] = [images[j], images[i]];
      return { ...g, images };
    });

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={serialize(grouped, groups)} />
      {groups.map((g, gi) => (
        <div key={gi} className={grouped ? 'space-y-2 rounded-lg border border-gray-200 p-3' : 'space-y-2'}>
          {grouped && (
            <div className="flex items-center gap-2">
              <input
                value={g.name}
                onChange={(e) => update(gi, (x) => ({ ...x, name: e.target.value }))}
                placeholder="שם האלבום (לא חובה)"
                aria-label="שם האלבום"
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button type="button" className="text-sm text-red-700" onClick={() => setGroups((prev) => prev.filter((_, k) => k !== gi))}>
                מחיקת אלבום
              </button>
            </div>
          )}
          {g.images.length === 0 && <p className="text-sm text-gray-500">אין תמונות.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.images.map((img, i) => (
              <li key={`${img.url}-${i}`} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="aspect-[4/3] w-full bg-gray-100 object-cover" loading="lazy" />
                <div className="space-y-1 p-2">
                  {!grouped && (
                    <input
                      value={img.alt ?? ''}
                      onChange={(e) => update(gi, (x) => ({ ...x, images: x.images.map((p, k) => (k === i ? { ...p, alt: e.target.value } : p)) }))}
                      placeholder="טקסט חלופי"
                      aria-label="טקסט חלופי"
                      className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                    />
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="flex gap-2">
                      <button type="button" onClick={() => move(gi, i, -1)} disabled={i === 0} className="text-gray-600 disabled:opacity-30" aria-label="הזזה קדימה">
                        →
                      </button>
                      <button type="button" onClick={() => move(gi, i, 1)} disabled={i === g.images.length - 1} className="text-gray-600 disabled:opacity-30" aria-label="הזזה אחורה">
                        ←
                      </button>
                    </span>
                    <button type="button" onClick={() => update(gi, (x) => ({ ...x, images: x.images.filter((_, k) => k !== i) }))} className="text-red-700 hover:underline">
                      הסרה
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setTarget(gi)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            + הוספת תמונה
          </button>
        </div>
      ))}
      {grouped && (
        <button type="button" onClick={() => setGroups((prev) => [...prev, { name: '', images: [] }])} className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm">
          + אלבום חדש
        </button>
      )}
      <MediaPicker
        open={target !== null}
        onClose={() => setTarget(null)}
        onSelect={(url) => target !== null && update(target, (g) => ({ ...g, images: [...g.images, { url, alt: null }] }))}
      />
    </div>
  );
}
