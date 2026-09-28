import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { listMembers } from '@/lib/db/members';
import type { Role } from '@/lib/db/types';
import { ROLE_LABELS, formatDate } from '@/lib/admin/labels';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { FilterBar } from '@/components/admin/PageHeader';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import { Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'משתמשים' };

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export default async function MembersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireRole('admin', '/admin/members/');
  const q = param(searchParams.q);
  const role = param(searchParams.role) as Role | undefined;
  const page = pageParam(searchParams.page);
  const pageSize = 50;
  const result = await listMembers(createClient(), { page, pageSize, search: q, role: role && ROLES.includes(role) ? role : undefined });

  return (
    <div className="max-w-6xl">
      <PageHeader title="משתמשים והרשאות" description={`${result.total} משתמשים רשומים`} />
      <FilterBar action="/admin/members/">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">שם, מייל או טלפון</span>
          <TextInput name="q" defaultValue={q} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">תפקיד</span>
          <Select name="role" defaultValue={role ?? ''}>
            <option value="">הכול</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>
      <DataTable
        rows={result.items}
        rowKey={(r) => r.id}
        empty="לא נמצאו משתמשים."
        columns={[
          {
            key: 'n',
            header: 'משתמש',
            render: (r) => (
              <Link href={`/admin/members/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                {r.full_name || r.email || r.id}
              </Link>
            ),
          },
          { key: 'e', header: 'מייל', render: (r) => <span dir="ltr">{r.email}</span> },
          { key: 'p', header: 'טלפון', className: 'hidden md:table-cell', render: (r) => <span dir="ltr">{r.phone ?? ''}</span> },
          { key: 'r', header: 'תפקיד', render: (r) => <StatusBadge label={ROLE_LABELS[r.role]} tone={r.role === 'admin' ? 'purple' : r.role === 'editor' ? 'blue' : r.role === 'pro' ? 'green' : 'gray'} /> },
          { key: 'd', header: 'הצטרף', render: (r) => formatDate(r.created_at) },
        ]}
      />
      <AdminPagination basePath="/admin/members/" params={{ q, role }} page={page} pageSize={pageSize} total={result.total} />
    </div>
  );
}
