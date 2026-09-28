'use client';

import { useState } from 'react';
import ActionForm, { SubmitButton, type FormAction } from '../ActionForm';
import FormField, { Checkbox, Section, Select, TextArea, TextInput, inputClass } from '../FormField';
import RichTextEditor from '../editor/RichTextEditor';
import ImageField from '../media/ImageField';
import GalleryField from '../media/GalleryField';
import { cleanSlug, slugify } from '@/lib/admin/slug';
import { formatAgorotPlain } from '@/lib/admin/labels';
import type { ProductCategoryRow, ProductRow } from '@/lib/db/types';

type Detail = { key: string; title: string; html: string };

export default function ProductForm({
  action,
  product,
  details,
  images,
  categories,
  selectedCategories,
  businesses,
}: {
  action: FormAction;
  product: ProductRow | null;
  details: Array<{ title: string; html: string }>;
  images: Array<{ url: string; alt?: string | null }>;
  categories: ProductCategoryRow[];
  selectedCategories: string[];
  businesses: Array<{ id: string; name: string }>;
}) {
  const p = product;
  const [name, setName] = useState(p?.name ?? '');
  const [slug, setSlug] = useState(p?.slug ?? '');
  const [touched, setTouched] = useState(Boolean(p));
  const [sections, setSections] = useState<Detail[]>(details.map((d, i) => ({ key: `d${i}`, ...d })));
  const [purchasable, setPurchasable] = useState(p?.is_purchasable ?? false);
  const effectiveSlug = touched ? slug : slugify(name);

  return (
    <ActionForm action={action} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="detail_keys" value={sections.map((s) => s.key).join(',')} />
      <div className="min-w-0 space-y-5">
        <Section title="מוצר">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="שם המוצר" htmlFor="name" required>
              <TextInput id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label="כתובת (slug)" htmlFor="slug" hint={<span dir="ltr">/product/{effectiveSlug}/</span>}>
              <input
                id="slug"
                name="slug"
                className={inputClass}
                value={effectiveSlug}
                onChange={(e) => {
                  setTouched(true);
                  setSlug(e.target.value);
                }}
                onBlur={() => slug && slug !== p?.slug && setSlug(cleanSlug(slug))}
              />
            </FormField>
          </div>
          {p && effectiveSlug !== p.slug && p.status === 'published' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <Checkbox name="create_redirect" defaultChecked label="ליצור הפניה 301 מהכתובת הקודמת" />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="כותרת משנה" htmlFor="subtitle">
              <TextInput id="subtitle" name="subtitle" defaultValue={p?.subtitle ?? ''} />
            </FormField>
            <FormField label="תגית על הכרטיס" htmlFor="tag_label" hint='למשל "דוד שמש".'>
              <TextInput id="tag_label" name="tag_label" defaultValue={p?.tag_label ?? ''} />
            </FormField>
          </div>
          <FormField label="תיאור קצר" htmlFor="short_description">
            <TextArea id="short_description" name="short_description" defaultValue={p?.short_description ?? ''} rows={3} />
          </FormField>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">תיאור מלא</p>
            <RichTextEditor name="description_html" defaultValue={p?.description_html ?? ''} minHeight={260} label="תיאור המוצר" />
          </div>
        </Section>

        <Section
          title="מקטעים נפתחים (אקורדיון)"
          aside={
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              onClick={() => setSections((s) => [...s, { key: `n${Date.now()}`, title: '', html: '' }])}
            >
              + מקטע
            </button>
          }
        >
          {sections.length === 0 && <p className="text-sm text-gray-500">אין מקטעים.</p>}
          {sections.map((s, i) => (
            <div key={s.key} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex gap-2">
                <TextInput name={`detail_title_${s.key}`} defaultValue={s.title} placeholder="כותרת המקטע" aria-label="כותרת המקטע" />
                <button type="button" disabled={i === 0} className="px-2 text-gray-500 disabled:opacity-30" onClick={() => setSections((arr) => { const n = [...arr]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} aria-label="למעלה">▲</button>
                <button type="button" className="text-sm text-red-700" onClick={() => setSections((arr) => arr.filter((x) => x.key !== s.key))}>
                  הסרה
                </button>
              </div>
              <RichTextEditor name={`detail_html_${s.key}`} defaultValue={s.html} minHeight={120} label={`תוכן המקטע ${i + 1}`} />
            </div>
          ))}
        </Section>

        <Section title="תמונות">
          <FormField label="תמונה ראשית">
            <ImageField name="featured_image" defaultValue={p?.featured_image} />
          </FormField>
          <GalleryField name="images" defaultValue={images} />
        </Section>

        <Section title="קידום (SEO)">
          <FormField label="כותרת SEO" htmlFor="seo_title">
            <TextInput id="seo_title" name="seo_title" defaultValue={p?.seo_title ?? ''} />
          </FormField>
          <FormField label="תיאור מטא" htmlFor="seo_description">
            <TextArea id="seo_description" name="seo_description" defaultValue={p?.seo_description ?? ''} rows={2} />
          </FormField>
          <FormField label="כתובת קנונית" htmlFor="seo_canonical">
            <TextInput id="seo_canonical" name="seo_canonical" dir="ltr" defaultValue={p?.seo_canonical ?? ''} />
          </FormField>
        </Section>
      </div>

      <aside className="space-y-5">
        <Section title="פרסום">
          <FormField label="סטטוס" htmlFor="status">
            <Select id="status" name="status" defaultValue={p?.status ?? 'draft'}>
              <option value="draft">טיוטה</option>
              <option value="published">פורסם</option>
              <option value="archived">בארכיון</option>
            </Select>
          </FormField>
          <FormField label="סדר" htmlFor="sort_order">
            <TextInput id="sort_order" name="sort_order" type="number" defaultValue={p?.sort_order ?? 0} />
          </FormField>
          <SubmitButton>שמירה</SubmitButton>
        </Section>
        <Section title="מחיר ורכישה">
          <Checkbox name="is_purchasable" checked={purchasable} onChange={(e) => setPurchasable(e.target.checked)} label="ניתן לרכוש באתר (סל קניות)" />
          <p className="text-xs text-gray-500">{purchasable ? 'המוצר נמכר דרך הסל והתשלום.' : 'במקום סל, מוצג טופס "חזרו אליי" שיוצר ליד.'}</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="מחיר (₪)" htmlFor="price">
              <TextInput id="price" name="price" inputMode="decimal" defaultValue={formatAgorotPlain(p?.price_agorot ?? 0)} dir="ltr" />
            </FormField>
            <FormField label="מחיר מבצע (₪)" htmlFor="sale_price">
              <TextInput id="sale_price" name="sale_price" inputMode="decimal" defaultValue={formatAgorotPlain(p?.sale_price_agorot)} dir="ltr" />
            </FormField>
            <FormField label='מק"ט' htmlFor="sku">
              <TextInput id="sku" name="sku" defaultValue={p?.sku ?? ''} dir="ltr" />
            </FormField>
            <FormField label="מלאי" htmlFor="stock_quantity" hint="ריק = ללא הגבלה">
              <TextInput id="stock_quantity" name="stock_quantity" type="number" defaultValue={p?.stock_quantity ?? ''} />
            </FormField>
          </div>
          <FormField label='כותרת תיבת "השאירו פרטים"' htmlFor="lead_heading">
            <TextInput id="lead_heading" name="lead_heading" defaultValue={p?.lead_heading ?? ''} />
          </FormField>
          <Checkbox name="lead_urgent_option" defaultChecked={p?.lead_urgent_option ?? false} label='להציג בטופס "צורך דחוף"' />
          <FormField label="עסק שותף" htmlFor="partner_business_id">
            <Select id="partner_business_id" name="partner_business_id" defaultValue={p?.partner_business_id ?? ''}>
              <option value="">ללא</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
        </Section>
        <Section title="קטגוריות">
          {(['product_cat', 'category_product'] as const).map((tax) => (
            <div key={tax}>
              <p className="mb-1 text-xs font-medium text-gray-500">{tax === 'product_cat' ? 'קטגוריות חנות (/product-category/)' : 'שלבי בנייה (/category-product/)'}</p>
              {categories
                .filter((c) => c.taxonomy === tax)
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="category_ids" value={c.id} defaultChecked={selectedCategories.includes(c.id)} className="h-4 w-4 rounded border-gray-300" />
                    {c.name}
                  </label>
                ))}
            </div>
          ))}
        </Section>
      </aside>
    </ActionForm>
  );
}
