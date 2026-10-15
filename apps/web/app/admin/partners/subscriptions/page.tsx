import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import ActionForm from '@/components/admin/ActionForm';
import DataTable from '@/components/admin/DataTable';
import StatusBadge from '@/components/admin/StatusBadge';
import { Section, Select, TextInput } from '@/components/admin/FormField';
import ActionButton from '@/components/revenue/admin/ActionButton';
import { formatDate } from '@/lib/admin/labels';
import { isEnabled } from '@/lib/flags';
import { createSubscription, setSubscriptionStatus } from '@/lib/revenue/actions/partners';
import { revenueUserDb } from '@/lib/revenue/db';
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/revenue/subscriptions';
import type { PartnerSubscriptionRow, PartnerSubscriptionStatus } from '@/lib/revenue/types';
import type { Tone } from '@/lib/admin/labels';

export const metadata = { title: 'מנויי שותפים' };

const TONES: Record<PartnerSubscriptionStatus, Tone> = { active: 'green', pending: 'amber', past_due: 'red', cancelled: 'gray' };
const PROVIDERS: Record<string, string> = { mock: 'תשלום (בדיקה)', upay: 'UPay', manual: 'ידני' };

/** Partner subscriptions: who is on which tier, manual sales and status changes. */
export default async function PartnerSubscriptionsPage() {
  if (!isEnabled('revenue')) notFound();
  const db = revenueUserDb();
  const [subsRes, tiersRes, bizRes] = await Promise.all([
    db.from('partner_subscriptions').select('*').order('created_at', { ascending: false }).limit(300),
    db.from('partner_tiers').select('id, name, rank, price_agorot').order('rank'),
    db.from('businesses').select('id, name, slug').eq('status', 'published').order('name'),
  ]);
  if (subsRes.error) throw new Error(subsRes.error.message);
  const subs = (subsRes.data ?? []) as PartnerSubscriptionRow[];
  const tiers = tiersRes.data ?? [];
  const businesses = bizRes.data ?? [];
  const tierName = new Map(tiers.map((t) => [t.id, t.name]));
  const biz = new Map(businesses.map((b) => [b.id, b]));
  const live = subs.filter((s) => s.status === 'active' || s.status === 'past_due');
  const mrr = live.reduce((sum, s) => sum + s.price_agorot, 0) / 100;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        title="מנויי שותפים"
        description={
          <>
            <span className="num">{live.length}</span> מנויים פעילים · הכנסה חודשית <span className="num">{mrr.toLocaleString('he-IL')}</span> ₪
          </>
        }
        actions={
          <Link href="/admin/partners/tiers/" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            מחירי המסלולים
          </Link>
        }
      />

      <DataTable
        rows={subs}
        rowKey={(s) => s.id}
        empty="עוד אין מנויים. אפשר להוסיף מנוי ידני למטה, או שבעל העסק יצטרף מהפורטל."
        columns={[
          {
            key: 'b',
            header: 'עסק',
            render: (s) => {
              const b = biz.get(s.business_id);
              return b ? (
                <Link href={`/admin/partners/${s.business_id}/report/`} className="font-medium hover:text-primary hover:underline">
                  {b.name}
                </Link>
              ) : (
                <span className="text-gray-500">עסק לא פעיל</span>
              );
            },
          },
          { key: 't', header: 'מסלול', render: (s) => tierName.get(s.tier_id) ?? '—' },
          { key: 's', header: 'סטטוס', render: (s) => <StatusBadge label={SUBSCRIPTION_STATUS_LABELS[s.status]} tone={TONES[s.status]} /> },
          { key: 'p', header: 'לחודש', render: (s) => <span className="num">{(s.price_agorot / 100).toLocaleString('he-IL')} ₪</span> },
          { key: 'd', header: 'עד', className: 'hidden md:table-cell', render: (s) => formatDate(s.current_period_end) },
          { key: 'v', header: 'אמצעי', className: 'hidden lg:table-cell', render: (s) => (s.provider ? PROVIDERS[s.provider] ?? s.provider : '—') },
          {
            key: 'a',
            header: <span className="sr-only">פעולות</span>,
            // relative: the sr-only label is absolutely positioned; keep it inside the table's scroll box on phones.
            className: 'relative',
            render: (s) => (
              <span className="flex flex-wrap gap-1.5">
                {s.status !== 'active' && <ActionButton action={setSubscriptionStatus.bind(null, s.id, 'active')}>הפעלה</ActionButton>}
                {s.status === 'active' && <ActionButton action={setSubscriptionStatus.bind(null, s.id, 'past_due')}>פיגור</ActionButton>}
                {s.status !== 'cancelled' && <ActionButton action={setSubscriptionStatus.bind(null, s.id, 'cancelled')}>ביטול</ActionButton>}
              </span>
            ),
          },
        ]}
      />

      <Section title="מנוי ידני (מכירה בטלפון, הסדר מיוחד)">
        <ActionForm action={createSubscription} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem] sm:items-end">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">עסק</span>
            <Select name="business_id" defaultValue="" required>
              <option value="">בחרו עסק</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">מסלול</span>
            <Select name="tier_id" defaultValue="" required>
              <option value="">בחרו מסלול</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {(t.price_agorot / 100).toLocaleString('he-IL')} ₪
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">סטטוס</span>
            <Select name="status" defaultValue="active">
              <option value="active">פעיל מעכשיו</option>
              <option value="pending">ממתין לתשלום</option>
            </Select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-gray-700">הערה</span>
            <TextInput name="note" placeholder="למשל: שלושה חודשים בהנחה" />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-700">
            הוספת מנוי
          </button>
        </ActionForm>
      </Section>
    </div>
  );
}
