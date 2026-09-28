import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listPagesForAdmin } from '@/lib/db/pages';
import { CONTENT_STATUS, formatDate } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { ButtonLink, FilterBar } from '@/components/admin/PageHeader';
import { param } from '@/components/admin/AdminPagination';
import { TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'עמודים' };

export default async function PagesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = param(searchParams.q)?.toLowerCase();
  const all = await listPagesForAdmin(createClient());
  const rows = q ? all.filter((p) => p.title.toLowerCase().includes(q) || p.slug.includes(q)) : all;
  return (
    <div className="max-w-6xl">
      <PageHeader title="עמודים" description={`${all.length} עמודים סטטיים`} actions={<ButtonLink href="/admin/pages/new/">עמוד חדש</ButtonLink>} />
      <FilterBar action="/admin/pages/">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">חיפוש</span>
          <TextInput name="q" defaultValue={q} />
        </label>
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'title',
            header: 'כותרת',
            render: (r) => (
              <div>
                <Link href={`/admin/pages/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                  {r.title}
                </Link>
                <p className="text-xs text-gray-500" dir="ltr">
                  /{r.slug}/
                </p>
              </div>
            ),
          },
          { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge info={CONTENT_STATUS[r.status]} /> },
          { key: 'updated', header: 'עודכן', render: (r) => formatDate(r.updated_at) },
          {
            key: 'a',
            header: <span className="sr-only">פעולות</span>,
            render: (r) => (
              <div className="flex gap-3">
                <Link href={`/admin/pages/${r.id}/`} className="text-primary hover:underline">
                  עריכה
                </Link>
                {r.status === 'published' && (
                  <a href={`/${r.slug.split('/').map(encodeURIComponent).join('/')}/`} target="_blank" rel="noopener" className="text-gray-600 hover:underline">
                    צפייה
                  </a>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
