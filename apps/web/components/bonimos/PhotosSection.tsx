'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { BUILD_STAGES, getStage } from '@/lib/stages';
import type { StageId } from '@/lib/hub/types';
import { checkPhotoSource, groupPhotos, PHOTOS_PER_BATCH } from '@/lib/bonimos/photos';
import type { ManagedProjectData, PhotoView } from '@/lib/bonimos/types';
import { useBonimosActions } from './BonimosActions';
import { FormError, OsSection, dateLabel } from './parts';

const GROUPS_SHOWN = 4;

/**
 * תמונות מהשטח: the site-photo feed, grouped by the day on site and the
 * stage, with captions. Uploads are resized in the browser first
 * (lib/bonimos/resize.ts), which also strips the location data.
 */
export function PhotosSection({ data }: { data: ManagedProjectData }) {
  const groups = useMemo(() => groupPhotos(data.photos), [data.photos]);
  const flat = useMemo(() => groups.flatMap((g) => g.photos), [groups]);
  const [showAll, setShowAll] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const names = useMemo(() => new Map(data.people.map((p) => [p.userId, p.name])), [data.people]);
  const visible = showAll ? groups : groups.slice(0, GROUPS_SHOWN);

  return (
    <OsSection
      id="photos"
      icon={<Camera />}
      title="תמונות מהשטח"
      subtitle="כל ביקור באתר מתועד, לפי תאריך ושלב. ככה רואים התקדמות גם בלי לנסוע לשטח."
      action={
        <Button variant="outline" size="sm" iconStart={<ImagePlus />} onClick={() => setUploading(true)}>
          העלאת תמונות
        </Button>
      }
    >
      {groups.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<Camera />}
          title="עוד אין תמונות מהשטח"
          description="צלמו בכל ביקור: ברזל לפני יציקה, צנרת לפני סגירת קירות, איטום לפני ריצוף. בעוד שנה תשמחו שיש לכם את זה."
          actions={
            <Button size="md" iconStart={<ImagePlus />} onClick={() => setUploading(true)}>
              העלאת תמונות ראשונות
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {visible.map((g) => (
            <section key={g.date} aria-label={`ביקור ${dateLabel(g.date, data.today)}`}>
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-title-sm text-ink-900">
                <time dateTime={g.date}>{dateLabel(g.date, data.today)}</time>
                {g.stages.map((s) => (
                  <Badge key={s} tone="sand" size="sm">
                    {getStage(s)?.label}
                  </Badge>
                ))}
                <span className="text-caption font-normal text-ink-500">
                  {g.photos.length === 1 ? 'תמונה אחת' : `${g.photos.length} תמונות`}
                </span>
              </h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {g.photos.map((p) => (
                  <li key={p.id}>
                    <figure>
                      <button
                        type="button"
                        onClick={() => setOpenIndex(flat.findIndex((x) => x.id === p.id))}
                        className="group/ph block w-full overflow-hidden rounded-xl bg-sand-100 ring-1 ring-inset ring-ink-100"
                        aria-label={`פתיחת התמונה${p.caption ? `: ${p.caption}` : ''}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by the browser upload */}
                        <img
                          src={p.thumbUrl}
                          alt={p.caption ?? 'תמונה מהשטח'}
                          width={480}
                          height={360}
                          loading="lazy"
                          decoding="async"
                          className="aspect-[4/3] w-full object-cover transition-transform duration-300 motion-safe:group-hover/ph:scale-[1.03]"
                        />
                      </button>
                      {p.caption && <figcaption className="mt-1 line-clamp-2 text-caption text-ink-700">{p.caption}</figcaption>}
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length > GROUPS_SHOWN && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'הצגת הביקורים האחרונים בלבד' : `הצגת ביקורים קודמים (${groups.length - GROUPS_SHOWN})`}
            </Button>
          )}
        </div>
      )}

      {openIndex != null && flat[openIndex] && (
        <Lightbox
          photos={flat}
          index={openIndex}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          data={data}
          uploaderName={(id) => (id ? names.get(id) ?? null : null)}
        />
      )}
      {uploading && <UploadDialog data={data} onClose={() => setUploading(false)} />}
    </OsSection>
  );
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  data,
  uploaderName,
}: {
  photos: PhotoView[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  data: ManagedProjectData;
  uploaderName: (id: string | null) => string | null;
}) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const p = photos[index];
  const canDelete = data.viewer.role === 'manager' || p.uploadedBy === data.viewer.userId;
  const by = uploaderName(p.uploadedBy);
  const stage = p.stage ? getStage(p.stage)?.label : null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={p.caption ?? 'תמונה מהשטח'}
      description={[dateLabel(p.takenOn, data.today), stage, by ? `צילום: ${by}` : null].filter(Boolean).join(' · ')}
      className="!w-[min(100vw-1rem,64rem)]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <IconButton label="התמונה הקודמת" icon={<ChevronRight className="ltr:rotate-180" />} variant="outline" disabled={index === 0} onClick={() => onIndex(index - 1)} />
            <span className="num px-2 text-caption text-ink-600">
              {index + 1} / {photos.length}
            </span>
            <IconButton
              label="התמונה הבאה"
              icon={<ChevronLeft className="ltr:rotate-180" />}
              variant="outline"
              disabled={index === photos.length - 1}
              onClick={() => onIndex(index + 1)}
            />
          </div>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              iconStart={<Trash2 />}
              loading={pending}
              onClick={() => {
                if (!window.confirm('למחוק את התמונה? אי אפשר לשחזר.')) return;
                startTransition(async () => {
                  const res = await actions.deletePhoto(p.id);
                  if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו למחוק.', tone: 'error' });
                  else {
                    toast({ title: 'התמונה נמחקה', tone: 'success' });
                    onClose();
                  }
                });
              }}
            >
              מחיקה
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-center justify-center rounded-2xl bg-ink-950/95 p-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img src={p.url} alt={p.caption ?? 'תמונה מהשטח'} width={p.width} height={p.height} className="max-h-[64dvh] w-auto max-w-full rounded-xl object-contain" />
      </div>
    </Dialog>
  );
}

type Picked = { key: string; file: File; url: string; caption: string };

function UploadDialog({ data, onClose }: { data: ManagedProjectData; onClose: () => void }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [stage, setStage] = useState<StageId | ''>(data.project.stage ?? '');
  const [takenOn, setTakenOn] = useState(data.today);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);

  // Release the preview URLs when the dialog closes.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function add(files: FileList | null) {
    // Copy first: clearing the input empties its live FileList.
    const chosen = Array.from(files ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!chosen.length) return;
    const next: Picked[] = [];
    const problems: string[] = [];
    for (const file of chosen) {
      const problem = checkPhotoSource(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      next.push({ key: `p${(seq.current += 1)}`, file, url, caption: '' });
    }
    setPicked((prev) => {
      const all = [...prev, ...next];
      if (all.length > PHOTOS_PER_BATCH) problems.push(`אפשר להעלות עד ${PHOTOS_PER_BATCH} תמונות בכל פעם.`);
      return all.slice(0, PHOTOS_PER_BATCH);
    });
    setError(problems.length ? problems.join(' ') : null);
  }

  function upload() {
    if (!picked.length) return setError('בחרו תמונות להעלאה.');
    if (!takenOn || takenOn > data.today) return setError('תאריך הצילום לא יכול להיות בעתיד.');
    setError(null);
    startTransition(async () => {
      const res = await actions.uploadPhotos({
        files: picked.map((p) => p.file),
        captions: picked.map((p) => p.caption),
        stage: stage || null,
        takenOn,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setProgress(null);
      if (!res.ok) return setError(res.message ?? 'ההעלאה נכשלה. נסו שוב.');
      toast({
        title: res.added === 1 ? 'התמונה נוספה לפיד' : `${res.added ?? picked.length} תמונות נוספו לפיד`,
        description: res.message,
        tone: res.message ? 'info' : 'success',
      });
      onClose();
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="העלאת תמונות מהשטח"
      description="התמונות מוקטנות בטלפון לפני ההעלאה ונשמרות בתיק הפרטי של הפרויקט. מיקום ה-GPS שבתמונה לא נשמר."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={upload} loading={pending} iconStart={<ImagePlus />} disabled={!picked.length}>
            {picked.length > 1 ? `העלאת ${picked.length} תמונות` : 'העלאת התמונה'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <input ref={inputRef} id={`${id}-files`} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
        <label
          htmlFor={`${id}-files`}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-ink-200 bg-paper p-4 text-center hover:border-primary-600"
        >
          <ImagePlus aria-hidden="true" className="size-6 text-primary-600" />
          <span className="text-body-sm font-semibold text-ink-900">{picked.length ? 'הוספת עוד תמונות' : 'בחירת תמונות מהטלפון או מהמחשב'}</span>
          <span className="text-caption text-ink-500">עד {PHOTOS_PER_BATCH} תמונות בכל העלאה</span>
        </label>

        {picked.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {picked.map((p, i) => (
              <li key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) */}
                <img src={p.url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-inset ring-ink-100" />
                <IconButton
                  label={`הסרת ${p.file.name}`}
                  icon={<X />}
                  size="sm"
                  variant="glass"
                  round
                  className="absolute end-1.5 top-1.5"
                  onClick={() => setPicked((all) => all.filter((x) => x.key !== p.key))}
                />
                <Input
                  aria-label={`כיתוב לתמונה ${i + 1}`}
                  placeholder="כיתוב (רשות)"
                  value={p.caption}
                  maxLength={300}
                  onChange={(e) => setPicked((all) => all.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))}
                  className="mt-1.5 h-10 text-body-sm"
                />
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="תאריך הצילום">
            <Input type="date" dir="ltr" value={takenOn} max={data.today} onChange={(e) => setTakenOn(e.target.value)} />
          </Field>
          <Field label="שלב">
            <Select value={stage} onChange={(e) => setStage(e.target.value as StageId | '')} placeholder="בלי שלב">
              {BUILD_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-caption text-ink-600" aria-live="polite">
          {progress ? `מעלים ${progress.done} מתוך ${progress.total}…` : ''}
        </p>
        {error && <FormError>{error}</FormError>}
      </div>
    </Dialog>
  );
}
