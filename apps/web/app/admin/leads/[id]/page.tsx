import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getLeadById } from '@/lib/db/leads';
import type { Json } from '@/lib/db/types';
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { saveLeadNotes, setLeadStatus } from '@/lib/admin/actions/leads';
import { LEAD_STATUS, LEAD_STATUS_ORDER, NOTIFY_STATUS, formatDateTime } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import { Section, TextArea } from '@/components/admin/FormField';
import LeadStatusButtons from '@/components/admin/LeadStatusButtons';

export const metadata = { title: 'פרטי ליד' };

function entries(value: Json): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-gray-50 py-1.5 text-sm last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children || '—'}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const lead = await getLeadById(db, params.id).catch(() => null);
  if (!lead) notFound();
  const [biz, region, member, product, plan] = await Promise.all([
    lead.business_id ? db.from('businesses').select('id, name').eq('id', lead.business_id).maybeSingle().then((r) => r.data) : null,
    lead.region_id ? db.from('regions').select('name').eq('id', lead.region_id).maybeSingle().then((r) => r.data) : null,
    lead.member_id ? db.from('profiles').select('id, email').eq('id', lead.member_id).maybeSingle().then((r) => r.data) : null,
    lead.product_id ? db.from('products').select('name').eq('id', lead.product_id).maybeSingle().then((r) => r.data) : null,
    lead.service_plan_id ? db.from('service_plans').select('name').eq('id', lead.service_plan_id).maybeSingle().then((r) => r.data) : null,
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader
        back={{ href: '/admin/leads/', label: 'תיבת לידים' }}
        title={lead.full_name || lead.email || 'ליד'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {LEAD_TYPE_LABELS[lead.type]} · {formatDateTime(lead.created_at)} <StatusBadge info={LEAD_STATUS[lead.status]} />
          </span>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Section title="פרטי הפנייה">
            <dl>
              <Row label="שם">{lead.full_name}</Row>
              <Row label="טלפון">
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} dir="ltr" className="text-primary hover:underline">
                    {lead.phone}
                  </a>
                )}
              </Row>
              <Row label="מייל">
                {lead.email && (
                  <a href={`mailto:${lead.email}`} dir="ltr" className="text-primary hover:underline">
                    {lead.email}
                  </a>
                )}
              </Row>
              <Row label="הודעה">
                <span className="whitespace-pre-line">{lead.message}</span>
              </Row>
              <Row label="אזור">{region?.name}</Row>
              <Row label="שלב בנייה">{lead.construction_stage}</Row>
              <Row label="עסק">{biz && <Link href={`/admin/directory/businesses/${biz.id}/`} className="text-primary hover:underline">{biz.name}</Link>}</Row>
              <Row label="מוצר / מסלול">{product?.name ?? plan?.name}</Row>
              <Row label="משתמש רשום">{member && (member.email ?? member.id)}</Row>
              <Row label="עמוד מקור">
                {lead.source_url && (
                  <a href={lead.source_url} target="_blank" rel="noopener" dir="ltr" className="break-all text-primary hover:underline">
                    {decodeURI(lead.source_url)}
                  </a>
                )}
              </Row>
            </dl>
          </Section>
          <Section title="כל שדות הטופס">
            <dl>
              {entries(lead.payload).length === 0 && <p className="text-sm text-gray-500">אין שדות נוספים.</p>}
              {entries(lead.payload).map(([k, v]) => (
                <Row key={k} label={k}>
                  {v}
                </Row>
              ))}
              {entries(lead.utm).map(([k, v]) => (
                <Row key={`utm-${k}`} label={`utm ${k}`}>
                  {v}
                </Row>
              ))}
            </dl>
          </Section>
        </div>
        <aside className="space-y-5">
          <Section title="טיפול">
            <LeadStatusButtons id={lead.id} current={lead.status} statuses={LEAD_STATUS_ORDER.map((s) => ({ key: s, label: LEAD_STATUS[s].label }))} action={setLeadStatus} />
            <ActionForm action={saveLeadNotes} className="space-y-2">
              <input type="hidden" name="id" value={lead.id} />
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">הערות פנימיות</span>
                <TextArea name="notes" defaultValue={lead.notes ?? ''} rows={5} />
              </label>
              <SubmitButton>שמירת הערות</SubmitButton>
            </ActionForm>
          </Section>
          <Section title="התראה">
            <dl>
              <Row label="מצב">
                <StatusBadge info={NOTIFY_STATUS[lead.notify_status]} />
              </Row>
              <Row label="נשלח ב">{formatDateTime(lead.notified_at)}</Row>
              <Row label="הועבר אל">
                <span dir="ltr">{lead.forwarded_to}</span>
              </Row>
              {entries(lead.notify_channels).map(([k, v]) => (
                <Row key={k} label={k}>
                  <span dir="ltr" className="text-xs">{v}</span>
                </Row>
              ))}
              {lead.notify_error && (
                <Row label="שגיאה">
                  <span className="text-red-700">{lead.notify_error}</span>
                </Row>
              )}
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}
