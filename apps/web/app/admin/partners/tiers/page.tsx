import { notFound } from 'next/navigation';
import PageHeader from '@/components/admin/PageHeader';
import ActionForm from '@/components/admin/ActionForm';
import { Checkbox, TextArea, TextInput } from '@/components/admin/FormField';
import { requireRole } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { saveTier } from '@/lib/revenue/actions/partners';
import { revenueUserDb } from '@/lib/revenue/db';
import type { PartnerTierRow } from '@/lib/revenue/types';

export const metadata = { title: 'מסלולי שותפות' };

function benefitsText(value: PartnerTierRow['benefits']): string {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').join('\n') : '';
}

/** Partner tiers (admins): names, monthly price, delivery target and benefits. */
export default async function PartnerTiersPage() {
  if (!isEnabled('revenue')) notFound();
  await requireRole('admin', '/admin/partners/tiers/');
  const { data, error } = await revenueUserDb().from('partner_tiers').select('*').order('rank');
  if (error) throw new Error(error.message);
  const tiers = (data ?? []) as PartnerTierRow[];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="מסלולי שותפות"
        description="המחירים כאן הם שמוצגים לבעלי העסקים בפורטל ונגבים בתשלום. מנוי קיים שומר על המחיר ששילם. יעד החשיפות מודד את בריאות השותף."
      />
      <div className="grid gap-5 lg:grid-cols-3">
        {tiers.map((t) => (
          <section key={t.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card sm:p-5">
            <p className="text-xs font-semibold text-gray-500">
              דרגה <span className="num">{t.rank}</span> · <span dir="ltr">{t.slug}</span>
            </p>
            <ActionForm action={saveTier} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={t.id} />
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">שם המסלול</span>
                <TextInput name="name" defaultValue={t.name} required />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">תווית בכרטיס העסק</span>
                <TextInput name="badge_label" defaultValue={t.badge_label} required />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">מחיר לחודש (₪)</span>
                  <TextInput name="price_nis" type="number" min={0} defaultValue={Math.round(t.price_agorot / 100)} dir="ltr" required />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">יעד חשיפות לחודש</span>
                  <TextInput name="monthly_impression_target" type="number" min={0} defaultValue={t.monthly_impression_target ?? ''} dir="ltr" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">הטבות (שורה לכל הטבה)</span>
                <TextArea name="benefits" rows={6} defaultValue={benefitsText(t.benefits)} />
              </label>
              <div className="flex items-center justify-between gap-3">
                <Checkbox name="is_active" defaultChecked={t.is_active} label="מוצג למכירה" />
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
                  שמירה
                </button>
              </div>
            </ActionForm>
          </section>
        ))}
      </div>
    </div>
  );
}
