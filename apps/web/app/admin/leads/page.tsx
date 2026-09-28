import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { countLeadsByStatus, listLeads } from '@/lib/db/leads';
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { LEAD_STATUS, LEAD_STATUS_ORDER, NOTIFY_STATUS, formatDateTime } from '@/lib/admin/labels';
import { leadFilterFromQuery } from '@/lib/admin/lead-filters';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import PageHeader, { FilterBar } from '@/components/admin/PageHeader';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';
import { Select, TextInput } from '@/components/admin/FormField';

export const metadata = { title: 'לידים' };

export default async function LeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = createClient();
  const query = {
    type: param(searchParams.type),
    status: param(searchParams.status),
    from: param(searchParams.from),
    to: param(searchParams.to),
    business: param(searchParams.business),
    q: param(searchParams.q),
  };
  const page = pageParam(searchParams.page);
  const pageSize = 50;
  const filter = leadFilterFromQuery(query);
  const [result, counts, { data: businesses }] = await Promise.all([
    listLeads(db, { ...filter, page, pageSize }),
    countLeadsByStatus(db, filter.type && !Array.isArray(filter.type) ? { type: filter.type } : {}),
    db.from('businesses').select('id, name').order('name'),
  ]);
  const bizName = new Map((businesses ?? []).map((b) => [b.id, b.name]));
  const exportQs = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as Array<[string, string]>).toString();

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="תיבת לידים"
        description={`${result.total.toLocaleString('he-IL')} לידים תואמים`}
        actions={
          <a href={`/admin/leads/export/${exportQs ? `?${exportQs}` : ''}`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            ייצוא ל-CSV
          </a>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {LEAD_STATUS_ORDER.map((s) => (
          <Link
            key={s}
            href={`/admin/leads/?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).filter(([, v]) => v) as Array<[string, string]>), status: s })}`}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${query.status === s ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}
          >
            {LEAD_STATUS[s].label} <span className="opacity-70">({counts[s] ?? 0})</span>
          </Link>
        ))}
      </div>
      <FilterBar action="/admin/leads/">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">סוג</span>
          <Select name="type" defaultValue={query.type ?? ''}>
            <option value="">הכול</option>
            {LEAD_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAD_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">סטטוס</span>
          <Select name="status" defaultValue={query.status ?? ''}>
            <option value="">הכול</option>
            {LEAD_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s].label}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">מתאריך</span>
          <TextInput type="date" name="from" defaultValue={query.from} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">עד תאריך</span>
          <TextInput type="date" name="to" defaultValue={query.to} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">עסק</span>
          <Select name="business" defaultValue={query.business ?? ''} className="max-w-[14rem]">
            <option value="">הכול</option>
            {(businesses ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="min-w-[10rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-600">שם / טלפון / מייל</span>
          <TextInput name="q" defaultValue={query.q} />
        </label>
      </FilterBar>
      <DataTable
        rows={result.items}
        rowKey={(r) => r.id}
        empty="אין לידים תואמים."
        columns={[
          { key: 'd', header: 'התקבל', render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span> },
          { key: 't', header: 'סוג', render: (r) => LEAD_TYPE_LABELS[r.type] },
          {
            key: 'n',
            header: 'פונה',
            render: (r) => (
              <Link href={`/admin/leads/${r.id}/`} className="font-medium hover:text-primary hover:underline">
                {r.full_name || r.email || r.phone || 'ללא שם'}
              </Link>
            ),
          },
          { key: 'p', header: 'טלפון', render: (r) => <span dir="ltr">{r.phone ?? ''}</span> },
          { key: 'b', header: 'עסק', className: 'hidden lg:table-cell', render: (r) => (r.business_id ? bizName.get(r.business_id) ?? '—' : '—') },
          { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={LEAD_STATUS[r.status]} /> },
          { key: 'ns', header: 'התראה', className: 'hidden md:table-cell', render: (r) => <StatusBadge info={NOTIFY_STATUS[r.notify_status]} /> },
        ]}
      />
      <AdminPagination basePath="/admin/leads/" params={query} page={page} pageSize={pageSize} total={result.total} />
    </div>
  );
}
