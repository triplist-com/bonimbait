import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { listLeads } from '@/lib/db/leads';
import type { Json, LeadStatus } from '@/lib/db/types';
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { approveBusinessRequest, rejectBusinessRequest } from '@/lib/admin/actions/directory';
import { BUSINESS_STATUS, LEAD_STATUS, ROLE_LABELS, formatDateTime } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { TextArea } from '@/components/admin/FormField';
import { param } from '@/components/admin/AdminPagination';

export const metadata = { title: 'בקשות הצטרפות וניהול' };

const OPEN: LeadStatus[] = ['new', 'contacted', 'in_progress'];

function payloadText(payload: Json): Array<[string, string]> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.entries(payload).flatMap(([k, v]) => (v === null || v === undefined || v === '' ? [] : [[k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string]]));
}

/** claim_business ("this is my business") and join_pro (new pro + draft listing) requests. */
export default async function RequestsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = createClient();
  const me = await getProfile();
  const isAdmin = me?.role === 'admin';
  const show = param(searchParams.show) === 'closed' ? 'closed' : 'open';
  const result = await listLeads(db, {
    type: ['claim_business', 'join_pro'],
    status: show === 'open' ? OPEN : ['won', 'lost', 'spam', 'qualified', 'closed'],
    pageSize: 100,
  });
  const bizIds = Array.from(new Set(result.items.flatMap((l) => (l.business_id ? [l.business_id] : []))));
  const memberIds = Array.from(new Set(result.items.flatMap((l) => (l.member_id ? [l.member_id] : []))));
  const [{ data: businesses }, { data: members }] = await Promise.all([
    bizIds.length ? db.from('businesses').select('id, name, slug, status, owner_member_id').in('id', bizIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string; slug: string; status: 'draft' | 'pending' | 'published' | 'suspended'; owner_member_id: string | null }> }),
    memberIds.length ? db.from('profiles').select('id, email, full_name, role').in('id', memberIds) : Promise.resolve({ data: [] as Array<{ id: string; email: string | null; full_name: string | null; role: 'member' | 'pro' | 'editor' | 'admin' }> }),
  ]);
  const biz = new Map((businesses ?? []).map((b) => [b.id, b]));
  const mem = new Map((members ?? []).map((m) => [m.id, m]));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="בקשות הצטרפות וניהול עסק"
        description="אישור בקשה משייך את המשתמש כבעלים של העסק, מעניק לו תפקיד 'בעל מקצוע' ומפרסם את העסק. רק מנהלים יכולים לאשר."
      />
      <nav className="mb-4 flex gap-2">
        {(['open', 'closed'] as const).map((k) => (
          <Link key={k} href={`/admin/directory/requests/?show=${k}`} className={`rounded-full px-3 py-1 text-sm ${show === k ? 'bg-primary text-white' : 'bg-white ring-1 ring-gray-200'}`}>
            {k === 'open' ? 'פתוחות' : 'טופלו'}
          </Link>
        ))}
      </nav>
      {!isAdmin && show === 'open' && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">אתם מחוברים כעורכי תוכן: אפשר לצפות בבקשות, אבל אישור או דחייה דורשים הרשאת מנהל.</p>
      )}
      {result.items.length === 0 && <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">אין בקשות.</p>}
      <ul className="space-y-4">
        {result.items.map((l) => {
          const b = l.business_id ? biz.get(l.business_id) : undefined;
          const m = l.member_id ? mem.get(l.member_id) : undefined;
          return (
            <li key={l.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">{LEAD_TYPE_LABELS[l.type]}</span>
                    <StatusBadge info={LEAD_STATUS[l.status]} />
                    <span className="text-gray-500">{formatDateTime(l.created_at)}</span>
                  </div>
                  <p>
                    <strong>{l.full_name ?? '—'}</strong> · <span dir="ltr">{l.phone ?? ''}</span> · <span dir="ltr">{l.email ?? ''}</span>
                  </p>
                  <p>
                    חשבון באתר:{' '}
                    {m ? (
                      <>
                        <span dir="ltr">{m.email}</span> ({ROLE_LABELS[m.role]})
                      </>
                    ) : (
                      <span className="text-red-700">לא מחובר / לא קיים</span>
                    )}
                  </p>
                  <p>
                    עסק:{' '}
                    {b ? (
                      <>
                        <Link href={`/admin/directory/businesses/${b.id}/`} className="text-primary hover:underline">
                          {b.name}
                        </Link>{' '}
                        <StatusBadge info={BUSINESS_STATUS[b.status]} />
                        {b.owner_member_id && b.owner_member_id !== l.member_id && <span className="ms-2 text-red-700">לעסק כבר יש בעלים אחר</span>}
                      </>
                    ) : (
                      <span className="text-red-700">אין עסק מקושר</span>
                    )}
                  </p>
                  {l.message && <p className="whitespace-pre-line text-gray-700">{l.message}</p>}
                  {payloadText(l.payload).length > 0 && (
                    <p className="text-xs text-gray-500">
                      {payloadText(l.payload)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ')}
                    </p>
                  )}
                  {l.notes && <p className="whitespace-pre-line text-xs text-gray-500">{l.notes}</p>}
                  <Link href={`/admin/leads/${l.id}/`} className="text-xs text-primary hover:underline">
                    פרטי הליד המלאים
                  </Link>
                </div>
                {isAdmin && show === 'open' && (
                  <div className="flex gap-2">
                    <ConfirmDialog
                      trigger="אישור"
                      triggerClassName="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      title="לאשר את הבקשה?"
                      body={`${m?.email ?? 'המשתמש'} יוגדר כבעלים של "${b?.name ?? ''}", יקבל תפקיד "בעל מקצוע", והעסק יפורסם.`}
                      confirmLabel="אישור"
                      tone="primary"
                      onConfirm={approveBusinessRequest.bind(null, l.id)}
                    />
                    <ConfirmDialog trigger="דחייה" title="לדחות את הבקשה?" confirmLabel="דחייה" onConfirm={rejectBusinessRequest.bind(null, l.id)}>
                      <label className="block text-sm">
                        <span className="mb-1 block text-gray-600">סיבה (לתיעוד פנימי)</span>
                        <TextArea name="reason" rows={2} />
                      </label>
                    </ConfirmDialog>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
