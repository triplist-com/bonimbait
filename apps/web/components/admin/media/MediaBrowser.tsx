'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, MEDIA_BUCKET, dedupePath, isImageName, uploadFolder, uploadPath } from '@/lib/admin/media';

type Entry = { name: string; isFolder: boolean; path: string; url: string | null; size?: number; created?: string };

const PAGE = 60;

/**
 * Browse and upload images in the Storage `media` bucket. Runs with the
 * editor's own session: Storage RLS ("media staff write") allows staff only.
 *
 * `onSelect` turns it into a picker (editor images, featured images).
 */
export default function MediaBrowser({ onSelect, compact = false }: { onSelect?: (url: string, name: string) => void; compact?: boolean }) {
  const [folder, setFolder] = useState<string>(uploadFolder());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(
    async (target: string, from = 0) => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: err } = await supabase.storage.from(MEDIA_BUCKET).list(target, {
        limit: PAGE,
        offset: from,
        sortBy: { column: 'name', order: 'desc' },
      });
      setLoading(false);
      if (err) {
        setError('טעינת התיקייה נכשלה.');
        return;
      }
      const rows: Entry[] = (data ?? [])
        .filter((o) => o.name !== '.emptyFolderPlaceholder')
        .map((o) => {
          const path = target ? `${target}/${o.name}` : o.name;
          const isFolder = o.id === null;
          return {
            name: o.name,
            isFolder,
            path,
            url: isFolder ? null : supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
            size: (o.metadata as { size?: number } | null)?.size,
            created: o.created_at ?? undefined,
          };
        });
      setEntries((prev) => (from === 0 ? rows : [...prev, ...rows]));
      setHasMore((data ?? []).length === PAGE);
      setOffset(from);
    },
    [],
  );

  useEffect(() => {
    void load(folder, 0);
  }, [folder, load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    let lastUrl: string | null = null;
    let lastName = '';
    for (const file of Array.from(files)) {
      if (!IMAGE_TYPES.includes(file.type)) {
        setError(`"${file.name}": ניתן להעלות תמונות בלבד (JPG, PNG, WEBP, GIF, SVG).`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`"${file.name}": הקובץ גדול מ-10MB.`);
        continue;
      }
      let path = uploadPath(file.name);
      let res = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (res.error && /exists|duplicate/i.test(res.error.message)) {
        path = dedupePath(path);
        res = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      }
      if (res.error) {
        setError(`העלאת "${file.name}" נכשלה.`);
        continue;
      }
      lastUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
      lastName = file.name;
    }
    setUploading(false);
    const current = uploadFolder();
    if (folder !== current) setFolder(current);
    else await load(current, 0);
    if (lastUrl) {
      setNotice('ההעלאה הושלמה.');
      if (onSelect && files.length === 1) onSelect(lastUrl, lastName);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('הכתובת הועתקה.');
    } catch {
      window.prompt('העתיקו את הכתובת:', url);
    }
  }

  const crumbs = folder ? folder.split('/') : [];

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="תיקיות">
          <button type="button" className="text-primary hover:underline" onClick={() => setFolder('')}>
            media
          </button>
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex items-center gap-1">
              <span className="text-gray-400">/</span>
              <button type="button" className="text-primary hover:underline" dir="ltr" onClick={() => setFolder(crumbs.slice(0, i + 1).join('/'))}>
                {c}
              </button>
            </span>
          ))}
        </nav>
        <label className={`inline-flex cursor-pointer items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 ${uploading ? 'opacity-60' : ''}`}>
          {uploading ? 'מעלה…' : 'העלאת תמונות'}
          <input type="file" accept={IMAGE_TYPES.join(',')} multiple className="sr-only" disabled={uploading} onChange={(e) => void upload(e.target.files)} />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        תמונות חדשות נשמרות בתיקייה <span dir="ltr">{uploadFolder()}</span>. עד 10MB לקובץ.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      <div className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6'}`}>
        {entries.map((e) =>
          e.isFolder ? (
            <button
              key={e.path}
              type="button"
              onClick={() => setFolder(e.path)}
              className="flex aspect-square flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:border-primary"
            >
              <span aria-hidden className="text-3xl">📁</span>
              <span dir="ltr" className="mt-1 max-w-full truncate px-1">{e.name}</span>
            </button>
          ) : (
            <figure key={e.path} className="group overflow-hidden rounded-lg border border-gray-200 bg-white">
              <button
                type="button"
                className="block aspect-square w-full bg-gray-100"
                onClick={() => (onSelect && e.url ? onSelect(e.url, e.name) : e.url && void copy(e.url))}
                title={onSelect ? 'בחירה' : 'העתקת כתובת'}
              >
                {isImageName(e.name) && e.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-500">{e.name}</span>
                )}
              </button>
              <figcaption className="flex items-center justify-between gap-1 px-2 py-1 text-xs text-gray-600">
                <span dir="ltr" className="truncate" title={e.name}>
                  {e.name}
                </span>
                {e.url && (
                  <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => void copy(e.url!)}>
                    העתקה
                  </button>
                )}
              </figcaption>
            </figure>
          ),
        )}
      </div>
      {!loading && entries.length === 0 && <p className="py-6 text-center text-sm text-gray-500">התיקייה ריקה.</p>}
      {loading && <p className="py-4 text-center text-sm text-gray-500">טוען…</p>}
      {hasMore && !loading && (
        <button type="button" className="w-full rounded-lg border border-gray-300 py-2 text-sm hover:bg-gray-50" onClick={() => void load(folder, offset + PAGE)}>
          טעינת עוד
        </button>
      )}
    </div>
  );
}
