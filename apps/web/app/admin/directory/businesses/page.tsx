import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listBusinessesForAdmin, listSpecialties } from '@/lib/db/businesses';
import type { BusinessStatus } from '@/lib/db/types';
import { BUSINESS_STATUS, formatDate } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { ButtonLink, FilterBar } from '@/components/admin/PageHeader';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import { Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'עסקים' };

const STATUSES: BusinessStatus[] = ['published', 'pending', 'draft', 'suspended'];

export default async function BusinessesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = createClient();
  const q = param(searchParams.q);
  const status = param(searchParams.status) as BusinessStatus | undefined;
  const page = pageParam(searchParams.page);
  const pageSize = 40;
  const [result, specialties] = await Promise.all([
    listBusinessesForAdmin(db, { page, pageSize, search: q, status: status && STATUSES.includes(status) ? status : undefined }),
    listSpecialties(db),
  ]);
  const spec = new Map(specialties.map((s) => [s.id, s.name]));

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="עסקים בנבחרת המומלצים"
        description={`${result.total} עסקים`}
        actions={
          <>
            <ButtonLink href="/admin/directory/ranking/" variant="secondary">
              סדר הופעה
            </ButtonLink>
            <ButtonLink href="/admin/directory/businesses/new/">עסק חדש</ButtonLink>
          </>
        }
      />
      <FilterBar action="/admin/directory/businesses/">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">חיפוש לפי שם</span>
          <TextInput name="q" defaultValue={q} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">סטטוס</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">הכול</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {BUSINESS_STATUS[s].label}
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>
      <DataTable
        rows={result.items}
        rowKey={(r) => r.id}
        columns={[
          {
            key: 'n',
            header: 'עסק',
            render: (r) => (
              <div>
                <Link href={`/admin/directory/businesses/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                  {r.name}
                </Link>
                <p className="text-xs text-gray-500">{r.city ?? ''}</p>
              </div>
            ),
          },
          { key: 's', header: 'תחום', render: (r) => (r.primary_specialty_id ? spec.get(r.primary_specialty_id) ?? '—' : '—') },
          { key: 'st', header: 'סטטוס', render: (r) => <StatusBadge info={BUSINESS_STATUS[r.status]} /> },
          { key: 'o', header: 'מיקום', render: (r) => r.sort_order },
          { key: 'r', header: 'לידים', className: 'hidden lg:table-cell', render: (r) => (r.lead_routing === 'direct' ? 'ישירות לעסק' : 'לאתר') },
          { key: 'ow', header: 'בעלים', className: 'hidden lg:table-cell', render: (r) => (r.owner_member_id ? 'משויך' : '—') },
          { key: 'u', header: 'עודכן', className: 'hidden md:table-cell', render: (r) => formatDate(r.updated_at) },
        ]}
      />
      <AdminPagination basePath="/admin/directory/businesses/" params={{ q, status }} page={page} pageSize={pageSize} total={result.total} />
    </div>
  );
}
