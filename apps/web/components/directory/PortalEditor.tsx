'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  type PortalState,
  saveContactsAction,
  saveDetailsAction,
  saveMediaAction,
  saveTaxonomyAction,
} from '@/app/partner-portal/actions';
import type { GalleryImage } from '@/lib/db/types';
import { createClient } from '@/lib/supabase/browser';

const input =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const IDLE: PortalState = { status: 'idle' };
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_GALLERY = 30;

function Save({ label = 'שמירה' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-xl bg-primary px-6 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
      {pending ? 'שומר…' : label}
    </button>
  );
}

function Status({ state }: { state: PortalState }) {
  if (state.status === 'idle') return null;
  return (
    <p role="status" className={`text-sm ${state.status === 'saved' ? 'text-emerald-700' : 'text-red-700'}`}>
      {state.message}
    </p>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function DetailsForm({
  businessId,
  defaults,
}: {
  businessId: string;
  defaults: { tagline: string; about: string; city: string; website: string };
}) {
  const [state, action] = useFormState(saveDetailsAction, IDLE);
  return (
    <Card title="פרטי העסק">
      <form action={action} className="space-y-4">
        <input type="hidden" name="business_id" value={businessId} />
        <Field label="משפט פתיחה" hint="מוצג בכרטיס העסק ברשימת המומלצים">
          <input name="tagline" maxLength={200} defaultValue={defaults.tagline} className={input} />
        </Field>
        <Field label="אודות העסק" hint="שורה ריקה מפרידה בין פסקאות. שורות שמתחילות ב-'-' יוצגו כרשימה.">
          <textarea name="about" rows={10} maxLength={8000} defaultValue={defaults.about} className={input} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="עיר">
            <input name="city" maxLength={80} defaultValue={defaults.city} className={input} />
          </Field>
          <Field label="אתר אינטרנט">
            <input name="website" type="url" dir="ltr" placeholder="https://" defaultValue={defaults.website} className={`${input} text-end`} />
          </Field>
        </div>
        <div className="flex items-center gap-4">
          <Save />
          <Status state={state} />
        </div>
      </form>
    </Card>
  );
}

export function ContactsForm({
  businessId,
  defaults,
  leadRouting,
}: {
  businessId: string;
  defaults: { phone: string; whatsapp: string; email: string; leadEmail: string; otherPhones: string };
  leadRouting: 'site' | 'direct';
}) {
  const [state, action] = useFormState(saveContactsAction, IDLE);
  return (
    <Card title="פרטי קשר">
      <p className="mb-4 text-sm text-gray-600">
        הטלפון מוצג לגולשים רק אחרי שהשאירו פרטים בטופס &quot;הצג טלפון&quot;.
        {leadRouting === 'site'
          ? ' הפניות מנותבות דרך צוות בונים בית.'
          : ' הפניות נשלחות ישירות לכתובת האימייל לפניות.'}
      </p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="business_id" value={businessId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="טלפון">
            <input name="phone" type="tel" dir="ltr" defaultValue={defaults.phone} className={`${input} text-end`} />
          </Field>
          <Field label="וואטסאפ" hint="ריק = לפי מספר הטלפון">
            <input name="whatsapp" type="tel" dir="ltr" defaultValue={defaults.whatsapp} className={`${input} text-end`} />
          </Field>
          <Field label="טלפונים נוספים" hint="מופרדים בפסיק, עד 3">
            <input name="other_phones" dir="ltr" defaultValue={defaults.otherPhones} className={`${input} text-end`} />
          </Field>
          <Field label="אימייל העסק">
            <input name="email" type="email" dir="ltr" defaultValue={defaults.email} className={`${input} text-end`} />
          </Field>
          <Field label="אימייל לקבלת פניות">
            <input name="lead_email" type="email" dir="ltr" defaultValue={defaults.leadEmail} className={`${input} text-end`} />
          </Field>
        </div>
        <div className="flex items-center gap-4">
          <Save />
          <Status state={state} />
        </div>
      </form>
    </Card>
  );
}

export function TaxonomyForm({
  businessId,
  specialties,
  regions,
  selectedSpecialties,
  selectedRegions,
  primarySpecialtyId,
}: {
  businessId: string;
  specialties: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  selectedSpecialties: string[];
  selectedRegions: string[];
  primarySpecialtyId: string | null;
}) {
  const [state, action] = useFormState(saveTaxonomyAction, IDLE);
  const [chosen, setChosen] = useState<string[]>(selectedSpecialties);
  const [filter, setFilter] = useState('');
  const visible = specialties.filter((s) => !filter || s.name.includes(filter.trim()) || chosen.includes(s.id));
  return (
    <Card title="התמחויות ואזורי שירות">
      <form action={action} className="space-y-5">
        <input type="hidden" name="business_id" value={businessId} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">התמחויות (עד 10)</legend>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="חיפוש התמחות…"
            className={`${input} mb-2`}
          />
          <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-xl border border-gray-200 p-3 sm:grid-cols-3">
            {visible.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="specialties"
                  value={s.id}
                  checked={chosen.includes(s.id)}
                  disabled={!chosen.includes(s.id) && chosen.length >= 10}
                  onChange={(e) =>
                    setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((id) => id !== s.id)))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
          {/* Hidden inputs keep choices that the search filter hides. */}
          {chosen
            .filter((id) => !visible.some((s) => s.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="specialties" value={id} />
            ))}
        </fieldset>
        {chosen.length > 1 && (
          <Field label="התמחות ראשית">
            <select name="primary_specialty_id" defaultValue={primarySpecialtyId ?? chosen[0]} className={input}>
              {specialties
                .filter((s) => chosen.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">אזורי שירות</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-gray-200 p-3 sm:grid-cols-3">
            {regions.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="regions" value={r.id} defaultChecked={selectedRegions.includes(r.id)} />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-4">
          <Save />
          <Status state={state} />
        </div>
      </form>
    </Card>
  );
}

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^(jpe?g|png|webp|gif|avif)$/.test(fromName)) return fromName;
  return file.type.split('/')[1] ?? 'jpg';
}

export function MediaForm({
  businessId,
  initialGallery,
  initialLogo,
}: {
  businessId: string;
  initialGallery: GalleryImage[];
  initialLogo: string | null;
}) {
  const [state, action] = useFormState(saveMediaAction, IDLE);
  const [gallery, setGallery] = useState<GalleryImage[]>(initialGallery);
  const [logo, setLogo] = useState<string>(initialLogo ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(files: FileList | null): Promise<string[]> {
    if (!files || files.length === 0) return [];
    setUploadError(null);
    setUploading(true);
    const supabase = createClient();
    const urls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setUploadError('ניתן להעלות קבצי תמונה בלבד.');
          continue;
        }
        if (file.size > MAX_BYTES) {
          setUploadError('גודל תמונה מקסימלי: 5MB.');
          continue;
        }
        const path = `businesses/${businessId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionOf(file)}`;
        const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          setUploadError('ההעלאה נכשלה. נסו שוב.');
          continue;
        }
        urls.push(supabase.storage.from('media').getPublicUrl(path).data.publicUrl);
      }
    } finally {
      setUploading(false);
    }
    return urls;
  }

  const move = (i: number, delta: number) =>
    setGallery((g) => {
      const j = i + delta;
      if (j < 0 || j >= g.length) return g;
      const next = [...g];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Card title="לוגו וגלריה">
      <form action={action} className="space-y-5">
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="gallery" value={JSON.stringify(gallery)} />
        <input type="hidden" name="logo_url" value={logo} />

        <div className="flex items-center gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="לוגו" className="h-20 w-20 rounded-xl border border-gray-100 object-contain" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-500">אין לוגו</span>
          )}
          <label className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-primary">
            החלפת לוגו
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const [url] = await upload(e.target.files);
                if (url) setLogo(url);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              גלריה ({gallery.length}/{MAX_GALLERY})
            </span>
            <label
              className={`cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-primary ${gallery.length >= MAX_GALLERY ? 'pointer-events-none opacity-50' : ''}`}
            >
              הוספת תמונות
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={async (e) => {
                  const urls = await upload(e.target.files);
                  setGallery((g) => [...g, ...urls.map((url) => ({ url, alt: null }))].slice(0, MAX_GALLERY));
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {gallery.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">עדיין אין תמונות.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((img, i) => (
                <li key={`${img.url}-${i}`} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt ?? ''} className="aspect-[4/3] w-full object-cover" />
                  <div className="flex items-center justify-between gap-1 p-1.5 text-xs">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30" aria-label="הזזה קדימה">
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => setGallery((g) => g.filter((_, k) => k !== i))}
                      className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                    >
                      הסרה
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === gallery.length - 1} className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-30" aria-label="הזזה אחורה">
                      ←
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {uploading && <p className="text-sm text-gray-600">מעלה תמונות…</p>}
        {uploadError && <p className="text-sm text-red-700">{uploadError}</p>}
        <div className="flex items-center gap-4">
          <Save label="שמירת תמונות" />
          <Status state={state} />
        </div>
        <p className="text-xs text-gray-500">תמונות חדשות מועלות מיד, אבל יופיעו בעמוד העסק רק אחרי שמירה.</p>
      </form>
    </Card>
  );
}
