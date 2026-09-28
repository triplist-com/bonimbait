import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPageById } from '@/lib/db/pages';
import { deletePage, savePage } from '@/lib/admin/actions/pages';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import ContentForm from '@/components/admin/content/ContentForm';
import FormField, { Section, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'עריכת עמוד' };

export default async function EditPagePage({ params }: { params: { id: string } }) {
  const isNew = params.id === 'new';
  const page = isNew ? null : await getPageById(createClient(), params.id).catch(() => null);
  if (!isNew && !page) notFound();

  return (
    <div className="max-w-7xl">
      <PageHeader
        back={{ href: '/admin/pages/', label: 'כל העמודים' }}
        title={page?.title ?? 'עמוד חדש'}
        actions={
          page && (
            <ConfirmDialog
              trigger="מחיקה"
              title="למחוק את העמוד?"
              body="העמוד יימחק לצמיתות והכתובת שלו תחזיר 404."
              confirmLabel="מחיקה"
              onConfirm={deletePage.bind(null, page.id)}
              redirectTo="/admin/pages/"
            />
          )
        }
      />
      <ContentForm
        action={savePage}
        pathPrefix="/"
        allowSlash
        wasPublished={page?.status === 'published'}
        previewHref={page ? `/admin/preview/page/${page.id}/` : undefined}
        publicHref={page ? `/${page.slug.split('/').map(encodeURIComponent).join('/')}/` : undefined}
        initial={{
          id: page?.id,
          title: page?.title ?? '',
          slug: page?.slug ?? '',
          body: page?.content_html ?? '',
          excerpt: page?.excerpt ?? null,
          featured_image: page?.featured_image ?? null,
          featured_image_alt: page?.featured_image_alt ?? null,
          status: page?.status ?? 'draft',
          published_at: page?.published_at ?? null,
          seo_title: page?.seo_title ?? null,
          seo_description: page?.seo_description ?? null,
          seo_canonical: page?.seo_canonical ?? null,
          noindex: page?.noindex ?? false,
        }}
        side={
          <Section title="מבנה">
            <FormField label="תבנית" htmlFor="template" hint="תבנית תצוגה מיוחדת (למשל thank-you). ריק = עמוד רגיל.">
              <TextInput id="template" name="template" defaultValue={page?.template ?? ''} dir="ltr" />
            </FormField>
            <FormField label="סדר" htmlFor="sort_order">
              <TextInput id="sort_order" name="sort_order" type="number" defaultValue={page?.sort_order ?? 0} />
            </FormField>
          </Section>
        }
      />
    </div>
  );
}
