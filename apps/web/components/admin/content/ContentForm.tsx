'use client';

import { useState, type ReactNode } from 'react';
import ActionForm, { SubmitButton, type FormAction } from '../ActionForm';
import FormField, { Checkbox, Section, TextArea, TextInput, inputClass } from '../FormField';
import RichTextEditor from '../editor/RichTextEditor';
import ImageField from '../media/ImageField';
import { cleanSlug, slugify } from '@/lib/admin/slug';

export type ContentInitial = {
  id?: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt?: string | null;
  status: string;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical: string | null;
  noindex: boolean;
};

/** ISO -> value for <input type="datetime-local"> in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialChoice(status: string, publishedAt: string | null): string {
  if (status === 'published' && publishedAt && new Date(publishedAt).getTime() > Date.now()) return 'scheduled';
  return status;
}

/**
 * Editor form shared by posts, pages and video pages: title + slug (auto
 * from the title until edited; renaming a published item offers a 301),
 * rich-text body, excerpt, featured image, publish box and SEO.
 * Type-specific fields come in through `main` and `side`.
 */
export default function ContentForm({
  action,
  initial,
  wasPublished,
  pathPrefix,
  bodyName = 'content_html',
  allowSlash = false,
  main,
  side,
  previewHref,
  publicHref,
  statusOptions = ['draft', 'published', 'scheduled', 'archived'],
  hideFeaturedAlt = false,
}: {
  action: FormAction;
  initial: ContentInitial;
  wasPublished: boolean;
  /** Public URL prefix shown before the slug, e.g. "/" or "/video/". */
  pathPrefix: string;
  bodyName?: string;
  allowSlash?: boolean;
  main?: ReactNode;
  side?: ReactNode;
  previewHref?: string;
  publicHref?: string;
  statusOptions?: string[];
  hideFeaturedAlt?: boolean;
}) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [choice, setChoice] = useState(initialChoice(initial.status, initial.published_at));
  const [when, setWhen] = useState(toLocalInput(initial.published_at));
  const [seoTitle, setSeoTitle] = useState(initial.seo_title ?? '');
  const [seoDesc, setSeoDesc] = useState(initial.seo_description ?? '');

  const effectiveSlug = slugTouched ? slug : slugify(title);
  const slugChanged = Boolean(initial.id) && effectiveSlug.trim() !== initial.slug && effectiveSlug.trim() !== '';
  const [whenTouched, setWhenTouched] = useState(false);
  // Untouched: send the stored timestamp as is (the input only has minute precision).
  const whenIso = whenTouched ? (when ? new Date(when).toISOString() : '') : (initial.published_at ?? '');

  const STATUS_LABELS: Record<string, string> = {
    draft: 'טיוטה',
    pending: 'ממתין לאישור',
    published: 'פורסם',
    scheduled: 'מתוזמן לפרסום',
    archived: 'בארכיון (מוסתר)',
  };

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="published_at" value={whenIso} />
      <div className="min-w-0 space-y-5">
        <Section title="תוכן">
          <FormField label="כותרת" htmlFor="title" required>
            <TextInput id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} className="text-lg font-semibold" />
          </FormField>
          <FormField
            label="כתובת (slug)"
            htmlFor="slug"
            hint={
              <span dir="ltr" className="break-all">
                {pathPrefix}
                {effectiveSlug || '…'}/
              </span>
            }
          >
            <input
              id="slug"
              name="slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              onBlur={() => {
                if (slug && slug !== initial.slug) setSlug(cleanSlug(slug, { allowSlash }));
              }}
              className={inputClass}
            />
          </FormField>
          {slugChanged && wasPublished && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-2">
                שיניתם את הכתובת של תוכן שכבר פורסם. גוגל ומבקרים עדיין מגיעים לכתובת הקודמת (
                <span dir="ltr">
                  {pathPrefix}
                  {initial.slug}/
                </span>
                ).
              </p>
              <Checkbox name="create_redirect" defaultChecked label="ליצור הפניה קבועה (301) מהכתובת הקודמת לחדשה" />
            </div>
          )}
          {main}
          <div>
            <p className="mb-1 block text-sm font-medium text-gray-700">גוף התוכן</p>
            <RichTextEditor name={bodyName} defaultValue={initial.body} />
          </div>
          <FormField label="תקציר" htmlFor="excerpt" hint="מוצג בכרטיסי מאמרים ובתוצאות חיפוש כשאין תיאור SEO.">
            <TextArea id="excerpt" name="excerpt" defaultValue={initial.excerpt ?? ''} rows={3} maxLength={2000} />
          </FormField>
        </Section>
        <Section title="קידום (SEO)">
          <FormField label="כותרת SEO" htmlFor="seo_title" hint={`${seoTitle.length} תווים (מומלץ עד 60). ריק = כותרת התוכן.`}>
            <TextInput id="seo_title" name="seo_title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={300} />
          </FormField>
          <FormField label="תיאור מטא" htmlFor="seo_description" hint={`${seoDesc.length} תווים (מומלץ 120–160).`}>
            <TextArea id="seo_description" name="seo_description" value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} rows={2} maxLength={1000} />
          </FormField>
          <FormField label="כתובת קנונית" htmlFor="seo_canonical" hint="ריק = הכתובת של העמוד עצמו. נתיב יחסי, למשל /איך-בוחרים-אדריכל/">
            <TextInput id="seo_canonical" name="seo_canonical" defaultValue={initial.seo_canonical ?? ''} dir="ltr" maxLength={1000} />
          </FormField>
          <Checkbox name="noindex" defaultChecked={initial.noindex} label="להסתיר ממנועי חיפוש (noindex)" />
        </Section>
      </div>

      <aside className="space-y-5">
        <Section title="פרסום">
          <FormField label="סטטוס" htmlFor="status">
            <select id="status" name="status" value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label={choice === 'scheduled' ? 'מועד פרסום' : 'תאריך פרסום'}
            htmlFor="published_at_local"
            hint={choice === 'scheduled' ? 'התוכן יופיע באתר במועד הזה.' : 'ריק = עכשיו, בעת הפרסום.'}
          >
            <TextInput id="published_at_local" type="datetime-local" value={when} onChange={(e) => {
                setWhenTouched(true);
                setWhen(e.target.value);
              }} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>שמירה</SubmitButton>
            {previewHref && (
              <a href={previewHref} target="_blank" rel="noopener" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                תצוגה מקדימה
              </a>
            )}
            {publicHref && wasPublished && (
              <a href={publicHref} target="_blank" rel="noopener" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                צפייה באתר
              </a>
            )}
          </div>
          {previewHref && <p className="text-xs text-gray-500">התצוגה המקדימה מציגה את הגרסה השמורה. שמרו קודם.</p>}
        </Section>
        {side}
        <Section title="תמונה ראשית">
          <ImageField name="featured_image" defaultValue={initial.featured_image} />
          {!hideFeaturedAlt && (
            <FormField label="טקסט חלופי" htmlFor="featured_image_alt">
              <TextInput id="featured_image_alt" name="featured_image_alt" defaultValue={initial.featured_image_alt ?? ''} maxLength={300} />
            </FormField>
          )}
        </Section>
      </aside>
    </ActionForm>
  );
}
