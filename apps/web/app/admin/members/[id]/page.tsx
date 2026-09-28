import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getProfileById } from '@/lib/db/members';
import { formatPrice } from '@/lib/db/commerce';
import type { Role } from '@/lib/db/types';
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { CONSTRUCTION_STAGES } from '@/lib/constants/community';
import { changeMemberRole } from '@/lib/admin/actions/settings';
import { BUSINESS_STATUS, LEAD_STATUS, ORDER_STATUS, REVIEW_STATUS, ROLE_LABELS, formatDate, formatDateTime } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import DataTable from '@/components/admin/DataTable';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { Section, Select } from '@/components/admin/FormField';

export const metadata = { title: 'פרופיל משתמש' };

export default async function MemberPage({ params }: { params: { id: string } }) {
  const me = await requireRole('admin', '/admin/members/');
  const db = createClient();
  const member = await getProfileById(db, params.id).catch(() => null);
  if (!member) notFound();
  const [{ data: orders }, leads, { data: businesses }, { data: reviews }, { data: region }] = await Promise.all([
    db.from('orders').select('*').eq('member_id', member.id).order('created_at', { ascending: false }),
    db.from('leads').select('*').eq('member_id', member.id).order('created_at', { ascending: false }).limit(200).then((r) => r.data ?? []),
    db.from('businesses').select('id, name, status').eq('owner_member_id', member.id),
    db.from('reviews').select('id, business_id, rating, status, created_at').eq('member_id', member.id).order('created_at', { ascending: false }),
    member.region_id ? db.from('regions').select('name').eq('id', member.region_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        back={{ href: '/admin/members/', label: 'כל המשתמשים' }}
        title={member.full_name || member.email || 'משתמש'}
        description={<StatusBadge label={ROLE_LABELS[member.role]} tone="blue" />}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section title="פרופיל">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-gray-500">מייל</dt>
            <dd dir="ltr" className="text-start">{member.email}</dd>
            <dt className="text-gray-500">טלפון</dt>
            <dd dir="ltr" className="text-start">{member.phone ?? '—'}</dd>
            <dt className="text-gray-500">שלב בנייה</dt>
            <dd>{CONSTRUCTION_STAGES.find((s) => s.value === member.construction_stage)?.label ?? member.construction_stage ?? '—'}</dd>
            <dt className="text-gray-500">אזור</dt>
            <dd>{region?.name ?? '—'}</dd>
            <dt className="text-gray-500">WhatsApp / עדכונים</dt>
            <dd>
              {member.whatsapp_opt_in ? 'כן' : 'לא'} / {member.newsletter_opt_in ? 'כן' : 'לא'}
            </dd>
            <dt className="text-gray-500">הצטרף</dt>
            <dd>{formatDateTime(member.created_at)}</dd>
          </dl>
        </Section>
        <Section title="תפקיד והרשאות">
          <p className="text-xs text-gray-500">
            בעל מקצוע: ניהול העסק שלו בפורטל. עורך תוכן: כל מסכי הניהול מלבד משתמשים ואישורי בעלות. מנהל: הכול.
          </p>
          {member.id === me.id ? (
            <p className="text-sm text-gray-600">זה החשבון שלכם. תפקיד של עצמכם אפשר לשנות רק דרך מנהל אחר.</p>
          ) : (
            <ConfirmDialog
              trigger="שינוי תפקיד…"
              triggerClassName="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              title={`שינוי תפקיד: ${member.email ?? ''}`}
              confirmLabel="עדכון"
              tone="primary"
              onConfirm={changeMemberRole.bind(null, member.id)}
            >
              <Select name="role" defaultValue={member.role} aria-label="תפקיד">
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </ConfirmDialog>
          )}
          {(businesses ?? []).length > 0 && (
            <div className="text-sm">
              <p className="mb-1 font-medium">עסקים בניהולו</p>
              {(businesses ?? []).map((b) => (
                <p key={b.id}>
                  <Link href={`/admin/directory/businesses/${b.id}/`} className="text-primary hover:underline">
                    {b.name}
                  </Link>{' '}
                  <StatusBadge info={BUSINESS_STATUS[b.status]} />
                </p>
              ))}
            </div>
          )}
        </Section>
      </div>
      <Section title={`הזמנות (${orders?.length ?? 0})`}>
        <DataTable
          rows={orders ?? []}
          rowKey={(r) => r.id}
          empty="אין הזמנות."
          columns={[
            { key: 'n', header: 'הזמנה', render: (r) => <Link href={`/admin/commerce/orders/${r.id}/`} className="text-primary hover:underline">#{r.order_number}</Link> },
            { key: 'd', header: 'תאריך', render: (r) => formatDate(r.created_at) },
            { key: 't', header: 'סכום', render: (r) => formatPrice(r.total_agorot) },
            { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={ORDER_STATUS[r.status]} /> },
          ]}
        />
      </Section>
      <Section title={`לידים (${leads.length})`}>
        <DataTable
          rows={leads}
          rowKey={(r) => r.id}
          empty="אין לידים."
          columns={[
            { key: 'd', header: 'תאריך', render: (r) => <Link href={`/admin/leads/${r.id}/`} className="text-primary hover:underline">{formatDateTime(r.created_at)}</Link> },
            { key: 't', header: 'סוג', render: (r) => LEAD_TYPE_LABELS[r.type] },
            { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={LEAD_STATUS[r.status]} /> },
          ]}
        />
      </Section>
      {(reviews ?? []).length > 0 && (
        <Section title={`ביקורות (${reviews?.length ?? 0})`}>
          <DataTable
            rows={reviews ?? []}
            rowKey={(r) => r.id}
            columns={[
              { key: 'd', header: 'תאריך', render: (r) => formatDate(r.created_at) },
              { key: 'r', header: 'ציון', render: (r) => r.rating },
              { key: 's', header: 'סטטוס', render: (r) => <StatusBadge info={REVIEW_STATUS[r.status]} /> },
              { key: 'b', header: '', render: (r) => <Link href={`/admin/directory/reviews/?business=${r.business_id}&status=all`} className="text-primary hover:underline">לביקורת</Link> },
            ]}
          />
        </Section>
      )}
    </div>
  );
}
