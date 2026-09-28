import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { pageRange } from '@/lib/db/client';
import { CONTENT_STATUS, contentStatusKey, formatDate } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { ButtonLink, FilterBar } from '@/components/admin/PageHeader';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import { Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'עמודי וידאו' };

export default async function VideosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = createClient();
  const q = param(searchParams.q);
  const kind = param(searchParams.kind);
  const page = pageParam(searchParams.page);
  const pageSize = 30;
  const { from, to } = pageRange(page, pageSize);
  let query = db
    .from('video_pages')
    .select('id, legacy_slug, title, status, published_at, updated_at, kind, youtube_ids', { count: 'exact' })
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, to);
  const term = q?.replace(/[%,()*\\]/g, ' ').trim();
  if (term) query = query.or(`title.ilike.*${term}*,legacy_slug.ilike.*${term}*`);
  if (kind === 'video' || kind === 'podcast') query = query.eq('kind', kind);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="max-w-6xl">
      <PageHeader title="עמודי וידאו ופודקאסט" description={`${count ?? 0} עמודים בכתובות /video/…`} actions={<ButtonLink href="/admin/videos/new/">עמוד וידאו חדש</ButtonLink>} />
      <FilterBar action="/admin/videos/">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">חיפוש</span>
          <TextInput name="q" defaultValue={q} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">סוג</span>
          <Select name="kind" defaultValue={kind ?? ''}>
            <option value="">הכול</option>
            <option value="video">וידאו</option>
            <option value="podcast">פודקאסט</option>
          </Select>
        </label>
      </FilterBar>
      <DataTable
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 't',
            header: 'כותרת',
            render: (r) => (
              <div>
                <Link href={`/admin/videos/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                  {r.title}
                </Link>
                <p className="max-w-md truncate text-xs text-gray-500" dir="ltr">
                  /video/{r.legacy_slug}/
                </p>
              </div>
            ),
          },
          { key: 'k', header: 'סוג', render: (r) => (r.kind === 'podcast' ? 'פודקאסט' : 'וידאו') },
          { key: 'y', header: 'YouTube', className: 'hidden lg:table-cell', render: (r) => <span dir="ltr" className="text-xs">{(r.youtube_ids ?? []).join(', ') || '—'}</span> },
          { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={CONTENT_STATUS[contentStatusKey(r.status, r.published_at)]} /> },
          { key: 'd', header: 'פורסם', render: (r) => formatDate(r.published_at) },
        ]}
      />
      <AdminPagination basePath="/admin/videos/" params={{ q, kind }} page={page} pageSize={pageSize} total={count ?? 0} />
    </div>
  );
}
