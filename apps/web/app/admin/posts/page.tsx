import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listAuthors, listPostCategories, listPostsForAdmin } from '@/lib/db/posts';
import type { ContentStatus } from '@/lib/db/types';
import { CONTENT_STATUS, contentStatusKey, formatDate } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { ButtonLink, FilterBar } from '@/components/admin/PageHeader';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import { Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'מאמרים' };

type SP = Record<string, string | string[] | undefined>;

const STATUSES = ['draft', 'published', 'scheduled', 'pending', 'archived'] as const;

export default async function PostsPage({ searchParams }: { searchParams: SP }) {
  const db = createClient();
  const q = param(searchParams.q);
  const status = param(searchParams.status) as ContentStatus | 'scheduled' | undefined;
  const category = param(searchParams.category);
  const page = pageParam(searchParams.page);
  const pageSize = 30;

  const [result, categories, authors] = await Promise.all([
    listPostsForAdmin(db, {
      page,
      pageSize,
      search: q,
      status: status && (STATUSES as readonly string[]).includes(status) ? status : undefined,
      categoryId: category,
    }),
    listPostCategories(db),
    listAuthors(db),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const authorName = new Map(authors.map((a) => [a.id, a.name]));

  return (
    <div className="max-w-6xl">
      <PageHeader title="מאמרים" description={`${result.total.toLocaleString('he-IL')} מאמרים`} actions={<ButtonLink href="/admin/posts/new/">מאמר חדש</ButtonLink>} />
      <FilterBar action="/admin/posts/">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">חיפוש</span>
          <TextInput name="q" defaultValue={q} placeholder="כותרת או כתובת" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">סטטוס</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">הכול</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTENT_STATUS[s].label}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">קטגוריה</span>
          <Select name="category" defaultValue={category ?? ''}>
            <option value="">הכול</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>
      <DataTable
        rows={result.items}
        rowKey={(r) => r.id}
        empty="לא נמצאו מאמרים."
        columns={[
          {
            key: 'title',
            header: 'כותרת',
            render: (r) => (
              <div>
                <Link href={`/admin/posts/${r.id}/`} className="font-medium text-gray-900 hover:text-primary hover:underline">
                  {r.title}
                </Link>
                <p className="mt-0.5 max-w-md truncate text-xs text-gray-500" dir="ltr">
                  /{r.slug}/
                </p>
              </div>
            ),
          },
          { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge info={CONTENT_STATUS[contentStatusKey(r.status, r.published_at)]} /> },
          { key: 'cat', header: 'קטגוריה', className: 'hidden lg:table-cell', render: (r) => (r.primary_category_id ? catName.get(r.primary_category_id) ?? '—' : '—') },
          { key: 'author', header: 'כותב', className: 'hidden lg:table-cell', render: (r) => (r.author_id ? authorName.get(r.author_id) ?? '—' : '—') },
          { key: 'published', header: 'פורסם', render: (r) => formatDate(r.published_at) },
          { key: 'updated', header: 'עודכן', className: 'hidden md:table-cell', render: (r) => formatDate(r.updated_at) },
          {
            key: 'actions',
            header: <span className="sr-only">פעולות</span>,
            render: (r) => (
              <div className="flex gap-3 text-sm">
                <Link href={`/admin/posts/${r.id}/`} className="text-primary hover:underline">
                  עריכה
                </Link>
                {r.status === 'published' && (
                  <a href={`/${encodeURIComponent(r.slug)}/`} target="_blank" rel="noopener" className="text-gray-600 hover:underline">
                    צפייה
                  </a>
                )}
              </div>
            ),
          },
        ]}
      />
      <AdminPagination basePath="/admin/posts/" params={{ q, status, category }} page={page} pageSize={pageSize} total={result.total} />
    </div>
  );
}
