'use client';

import { useState } from 'react';
import ActionForm, { SubmitButton, type FormAction } from '../ActionForm';
import FormField, { Checkbox, Section, Select, TextArea, TextInput, inputClass } from '../FormField';
import RichTextEditor from '../editor/RichTextEditor';
import ImageField from '../media/ImageField';
import GalleryField from '../media/GalleryField';
import { cleanSlug, slugify } from '@/lib/admin/slug';
import type { BusinessContactRow, BusinessRow, RegionRow, SpecialtyRow } from '@/lib/db/types';

export type BusinessFormData = {
  business: BusinessRow | null;
  contacts: BusinessContactRow | null;
  specialtyIds: string[];
  regionIds: string[];
  ownerEmail: string | null;
  gallery: Array<{ url: string; alt?: string | null }>;
};

function socialToText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/** Directory listing editor: public profile, private contacts and lead routing, ranking, taxonomy, media, SEO. */
export default function BusinessForm({
  action,
  data,
  specialties,
  regions,
}: {
  action: FormAction;
  data: BusinessFormData;
  specialties: SpecialtyRow[];
  regions: RegionRow[];
}) {
  const b = data.business;
  const [name, setName] = useState(b?.name ?? '');
  const [slug, setSlug] = useState(b?.slug ?? '');
  const [touched, setTouched] = useState(Boolean(b));
  const [routing, setRouting] = useState(b?.lead_routing ?? 'site');
  const effectiveSlug = touched ? slug : slugify(name);
  const slugChanged = Boolean(b) && effectiveSlug !== b?.slug;

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="min-w-0 space-y-5">
        <Section title="פרופיל ציבורי">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="שם העסק" htmlFor="name" required>
              <TextInput id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label="כתובת (slug)" htmlFor="slug" hint={<span dir="ltr">/business/{effectiveSlug}/</span>}>
              <input
                id="slug"
                name="slug"
                className={inputClass}
                value={effectiveSlug}
                onChange={(e) => {
                  setTouched(true);
                  setSlug(e.target.value);
                }}
                onBlur={() => slug && slug !== b?.slug && setSlug(cleanSlug(slug))}
              />
            </FormField>
          </div>
          {slugChanged && b?.status === 'published' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Checkbox name="create_redirect" defaultChecked label="ליצור הפניה קבועה (301) מהכתובת הקודמת של העסק" />
            </div>
          )}
          <FormField label="שורת תיאור" htmlFor="tagline">
            <TextInput id="tagline" name="tagline" defaultValue={b?.tagline ?? ''} />
          </FormField>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">אודות העסק</p>
            <RichTextEditor name="description_html" defaultValue={b?.description_html ?? ''} minHeight={220} label="אודות העסק" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="עיר" htmlFor="city">
              <TextInput id="city" name="city" defaultValue={b?.city ?? ''} />
            </FormField>
            <FormField label="כתובת" htmlFor="address">
              <TextInput id="address" name="address" defaultValue={b?.address ?? ''} />
            </FormField>
            <FormField label="אתר אינטרנט" htmlFor="website">
              <TextInput id="website" name="website" defaultValue={b?.website ?? ''} dir="ltr" />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="רשתות חברתיות" htmlFor="social_links" hint="שורה לכל רשת: facebook: https://…">
              <TextArea id="social_links" name="social_links" dir="ltr" defaultValue={socialToText(b?.social_links)} rows={3} />
            </FormField>
            <FormField label="קישורים נוספים" htmlFor="extra_links" hint="קישור בכל שורה.">
              <TextArea id="extra_links" name="extra_links" dir="ltr" defaultValue={Array.isArray(b?.extra_links) ? (b?.extra_links as string[]).join('\n') : ''} rows={3} />
            </FormField>
          </div>
          <FormField label="סרטוני YouTube" htmlFor="youtube_ids" hint="מזהה או קישור בכל שורה.">
            <TextArea id="youtube_ids" name="youtube_ids" dir="ltr" defaultValue={(b?.youtube_ids ?? []).join('\n')} rows={2} />
          </FormField>
        </Section>

        <Section title="פרטי קשר (פרטיים) וניתוב לידים">
          <p className="text-xs text-gray-500">הטלפונים לא מוצגים באתר. הם נחשפים למבקר רק אחרי שהשאיר פרטים בחלון הפנייה.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="טלפון" htmlFor="phone">
              <TextInput id="phone" name="phone" dir="ltr" defaultValue={data.contacts?.phone ?? ''} />
            </FormField>
            <FormField label="WhatsApp" htmlFor="whatsapp">
              <TextInput id="whatsapp" name="whatsapp" dir="ltr" defaultValue={data.contacts?.whatsapp ?? ''} />
            </FormField>
            <FormField label="מייל העסק" htmlFor="email">
              <TextInput id="email" name="email" type="email" dir="ltr" defaultValue={data.contacts?.email ?? ''} />
            </FormField>
          </div>
          <FormField label="טלפונים נוספים" htmlFor="other_phones" hint="מופרדים בפסיק.">
            <TextInput id="other_phones" name="other_phones" dir="ltr" defaultValue={(data.contacts?.other_phones ?? []).join(', ')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="ניתוב לידים" htmlFor="lead_routing">
              <Select id="lead_routing" name="lead_routing" value={routing} onChange={(e) => setRouting(e.target.value as 'site' | 'direct')}>
                <option value="site">לתיבת האתר (info@)</option>
                <option value="direct">ישירות לעסק</option>
              </Select>
            </FormField>
            <FormField label="מייל לקבלת לידים" htmlFor="lead_email" hint={routing === 'direct' ? 'חובה בניתוב ישיר.' : 'בשימוש רק בניתוב ישיר.'}>
              <TextInput id="lead_email" name="lead_email" type="email" dir="ltr" defaultValue={data.contacts?.lead_email ?? ''} required={routing === 'direct'} />
            </FormField>
          </div>
        </Section>

        <Section title="לוגו, תמונת רקע וגלריה">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="לוגו">
              <ImageField name="logo_url" defaultValue={b?.logo_url} />
            </FormField>
            <FormField label="תמונת רקע">
              <ImageField name="cover_image_url" defaultValue={b?.cover_image_url} />
            </FormField>
          </div>
          <GalleryField name="gallery" defaultValue={data.gallery} />
        </Section>

        <Section title="קידום (SEO)">
          <FormField label="כותרת SEO" htmlFor="seo_title">
            <TextInput id="seo_title" name="seo_title" defaultValue={b?.seo_title ?? ''} />
          </FormField>
          <FormField label="תיאור מטא" htmlFor="seo_description">
            <TextArea id="seo_description" name="seo_description" defaultValue={b?.seo_description ?? ''} rows={2} />
          </FormField>
          <FormField label="כתובת קנונית" htmlFor="seo_canonical">
            <TextInput id="seo_canonical" name="seo_canonical" dir="ltr" defaultValue={b?.seo_canonical ?? ''} />
          </FormField>
        </Section>
      </div>

      <aside className="space-y-5">
        <Section title="פרסום ודירוג">
          <FormField label="סטטוס" htmlFor="status">
            <Select id="status" name="status" defaultValue={b?.status ?? 'draft'}>
              <option value="draft">טיוטה</option>
              <option value="pending">ממתין לאישור</option>
              <option value="published">מפורסם</option>
              <option value="suspended">מושהה</option>
            </Select>
          </FormField>
          <FormField label="מיקום ברשימה" htmlFor="sort_order" hint="מספר נמוך מופיע קודם. אפשר גם לגרור בעמוד 'סדר הופעה'.">
            <TextInput id="sort_order" name="sort_order" type="number" defaultValue={b?.sort_order ?? 1000} />
          </FormField>
          <Checkbox name="is_featured" defaultChecked={b?.is_featured ?? false} label="מומלץ (מוצג ראשון)" />
          <FormField label="מסלול" htmlFor="tier">
            <Select id="tier" name="tier" defaultValue={b?.tier ?? 'free'}>
              <option value="free">חינם</option>
              <option value="basic">בסיסי</option>
              <option value="premium">פרימיום</option>
            </Select>
          </FormField>
          <FormField label="בעלים (מייל המשתמש)" htmlFor="owner_email" hint="המשתמש יוכל לערוך את העסק בפורטל. לשינוי תפקיד ל'בעל מקצוע' ראו משתמשים.">
            <TextInput id="owner_email" name="owner_email" type="email" dir="ltr" defaultValue={data.ownerEmail ?? ''} />
          </FormField>
          <SubmitButton>שמירה</SubmitButton>
          {b?.status === 'published' && (
            <a href={`/business/${encodeURIComponent(b.slug)}/`} target="_blank" rel="noopener" className="ms-2 text-sm text-primary hover:underline">
              צפייה באתר
            </a>
          )}
        </Section>
        <Section title="תחומים">
          <FormField label="תחום ראשי" htmlFor="primary_specialty_id">
            <Select id="primary_specialty_id" name="primary_specialty_id" defaultValue={b?.primary_specialty_id ?? ''}>
              <option value="">ללא</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-2">
            {specialties.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="specialty_ids" value={s.id} defaultChecked={data.specialtyIds.includes(s.id)} className="h-4 w-4 rounded border-gray-300" />
                {s.name}
              </label>
            ))}
          </div>
        </Section>
        <Section title="אזורי עבודה">
          <div className="space-y-1">
            {regions.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="region_ids" value={r.id} defaultChecked={data.regionIds.includes(r.id)} className="h-4 w-4 rounded border-gray-300" />
                {r.name}
              </label>
            ))}
          </div>
        </Section>
      </aside>
    </ActionForm>
  );
}
