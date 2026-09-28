import { createClient } from '@/lib/supabase/server';
import { listAuthors, listPostCategories, listPostTags } from '@/lib/db/posts';
import { removeCategory, removeTag, saveAuthorAction, saveCategory, saveTag } from '@/lib/admin/actions/posts';
import PageHeader from '@/components/admin/PageHeader';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Section, TextArea, TextInput } from '@/components/admin/FormField';
import { param } from '@/components/admin/AdminPagination';

export const metadata = { title: 'קטגוריות, תגיות וכותבים' };

const cell = 'min-w-0';

export default async function TaxonomyPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = createClient();
  const [categories, tags, authors] = await Promise.all([listPostCategories(db), listPostTags(db), listAuthors(db)]);
  const tq = param(searchParams.tag)?.toLowerCase();
  const shownTags = (tq ? tags.filter((t) => t.name.toLowerCase().includes(tq) || t.slug.includes(tq)) : tags).slice(0, 60);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="קטגוריות, תגיות וכותבים" description="הקטגוריות קובעות את עמודי /category/…; שינוי כתובת של קטגוריה משנה את כתובת הארכיון שלה." />

      <Section title={`קטגוריות (${categories.length})`}>
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-100 p-2">
              <ActionForm action={saveCategory} className="grid grid-cols-1 items-end gap-2 md:grid-cols-[1fr_1fr_5rem_1.5fr_auto]">
                <input type="hidden" name="id" value={c.id} />
                <label className={cell}>
                  <span className="text-xs text-gray-500">שם</span>
                  <TextInput name="name" defaultValue={c.name} required />
                </label>
                <label className={cell}>
                  <span className="text-xs text-gray-500">כתובת</span>
                  <TextInput name="slug" defaultValue={c.slug} dir="ltr" />
                </label>
                <label className={cell}>
                  <span className="text-xs text-gray-500">סדר</span>
                  <TextInput name="sort_order" type="number" defaultValue={c.sort_order} />
                </label>
                <label className={cell}>
                  <span className="text-xs text-gray-500">כותרת SEO</span>
                  <TextInput name="seo_title" defaultValue={c.seo_title ?? ''} />
                </label>
                <div className="flex gap-2">
                  <SubmitButton>שמירה</SubmitButton>
                  <ConfirmDialog trigger="מחיקה" title={`למחוק את "${c.name}"?`} body="המאמרים לא יימחקו, רק השיוך לקטגוריה." onConfirm={removeCategory.bind(null, c.id)} />
                </div>
                <input type="hidden" name="description" value={c.description ?? ''} />
                <input type="hidden" name="seo_description" value={c.seo_description ?? ''} />
              </ActionForm>
            </div>
          ))}
        </div>
        <details className="rounded-lg border border-dashed border-gray-300 p-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">+ קטגוריה חדשה</summary>
          <ActionForm action={saveCategory} resetOnSuccess className="mt-3 grid gap-2 md:grid-cols-2">
            <TextInput name="name" placeholder="שם" required />
            <TextInput name="slug" placeholder="כתובת (אוטומטית מהשם)" dir="ltr" />
            <TextArea name="description" placeholder="תיאור" className="md:col-span-2" />
            <TextInput name="seo_title" placeholder="כותרת SEO" />
            <TextInput name="seo_description" placeholder="תיאור SEO" />
            <div>
              <SubmitButton>הוספה</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Section>

      <Section title={`תגיות (${tags.length})`}>
        <form method="get" className="flex gap-2">
          <TextInput name="tag" defaultValue={tq} placeholder="חיפוש תגית" />
          <button className="rounded-lg bg-gray-800 px-3 text-sm text-white">חיפוש</button>
        </form>
        <p className="text-xs text-gray-500">מוצגות עד 60 תגיות. תגיות חדשות נוצרות גם ישירות מטופס המאמר.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {shownTags.map((t) => (
            <ActionForm key={t.id} action={saveTag} className="flex items-end gap-2 rounded-lg border border-gray-100 p-2">
              <input type="hidden" name="id" value={t.id} />
              <TextInput name="name" defaultValue={t.name} aria-label="שם" />
              <TextInput name="slug" defaultValue={t.slug} dir="ltr" aria-label="כתובת" />
              <SubmitButton>שמירה</SubmitButton>
              <ConfirmDialog trigger="מחיקה" title={`למחוק את התגית "${t.name}"?`} onConfirm={removeTag.bind(null, t.id)} />
            </ActionForm>
          ))}
        </div>
      </Section>

      <Section title="כותבים">
        {[...authors, null].map((a) => (
          <ActionForm key={a?.id ?? 'new'} action={saveAuthorAction} resetOnSuccess={!a} className="grid items-end gap-2 rounded-lg border border-gray-100 p-2 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            {a && <input type="hidden" name="id" value={a.id} />}
            <TextInput name="name" defaultValue={a?.name ?? ''} placeholder={a ? undefined : 'כותב חדש'} required aria-label="שם" />
            <TextInput name="slug" defaultValue={a?.slug ?? ''} dir="ltr" aria-label="כתובת" placeholder="כתובת" />
            <TextInput name="avatar_url" defaultValue={a?.avatar_url ?? ''} dir="ltr" aria-label="תמונה" placeholder="קישור לתמונה" />
            <SubmitButton>{a ? 'שמירה' : 'הוספה'}</SubmitButton>
            <input type="hidden" name="bio_html" value={a?.bio_html ?? ''} />
          </ActionForm>
        ))}
      </Section>
    </div>
  );
}
