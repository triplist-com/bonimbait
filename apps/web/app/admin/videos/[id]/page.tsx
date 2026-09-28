import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getVideoPageById } from '@/lib/db/videos';
import { deleteVideoPage, saveVideoPage } from '@/lib/admin/actions/pages';
import PageHeader from '@/components/admin/PageHeader';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import ContentForm from '@/components/admin/content/ContentForm';
import FormField, { Section, Select, TextArea, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'עריכת עמוד וידאו' };

export default async function EditVideoPage({ params }: { params: { id: string } }) {
  const isNew = params.id === 'new';
  const v = isNew ? null : await getVideoPageById(createClient(), params.id).catch(() => null);
  if (!isNew && !v) notFound();

  return (
    <div className="max-w-7xl">
      <PageHeader
        back={{ href: '/admin/videos/', label: 'כל עמודי הווידאו' }}
        title={v?.title ?? 'עמוד וידאו חדש'}
        actions={
          v && (
            <ConfirmDialog
              trigger="מחיקה"
              title="למחוק את עמוד הווידאו?"
              body="הכתובת תחזיר 404. אם העמוד מדורג בגוגל, עדיף הפניה."
              confirmLabel="מחיקה"
              onConfirm={deleteVideoPage.bind(null, v.id)}
              redirectTo="/admin/videos/"
            />
          )
        }
      />
      <ContentForm
        action={saveVideoPage}
        pathPrefix="/video/"
        bodyName="body_html"
        hideFeaturedAlt
        wasPublished={v?.status === 'published'}
        previewHref={v ? `/admin/preview/video/${v.id}/` : undefined}
        publicHref={v ? `/video/${encodeURIComponent(v.legacy_slug)}/` : undefined}
        initial={{
          id: v?.id,
          title: v?.title ?? '',
          slug: v?.legacy_slug ?? '',
          body: v?.body_html ?? '',
          excerpt: v?.excerpt ?? null,
          featured_image: v?.featured_image ?? null,
          status: v?.status ?? 'draft',
          published_at: v?.published_at ?? null,
          seo_title: v?.seo_title ?? null,
          seo_description: v?.seo_description ?? null,
          seo_canonical: v?.seo_canonical ?? null,
          noindex: v?.noindex ?? false,
        }}
        main={
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="מזהי YouTube" htmlFor="youtube_ids" hint="מזהה או קישור, אחד בכל שורה. הראשון הוא הסרטון הראשי.">
              <TextArea id="youtube_ids" name="youtube_ids" dir="ltr" defaultValue={(v?.youtube_ids ?? []).join('\n')} rows={3} />
            </FormField>
            <FormField label="סרטונים קשורים" htmlFor="related_youtube_ids" hint="מזהים או קישורים, אחד בכל שורה.">
              <TextArea id="related_youtube_ids" name="related_youtube_ids" dir="ltr" defaultValue={(v?.related_youtube_ids ?? []).join('\n')} rows={3} />
            </FormField>
          </div>
        }
        side={
          <Section title="פרטי הסרטון">
            <FormField label="סוג" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue={v?.kind ?? 'video'}>
                <option value="video">וידאו</option>
                <option value="podcast">פודקאסט</option>
              </Select>
            </FormField>
            <FormField label="מגיש / כותב" htmlFor="author_name">
              <TextInput id="author_name" name="author_name" defaultValue={v?.author_name ?? ''} />
            </FormField>
          </Section>
        }
      />
    </div>
  );
}
