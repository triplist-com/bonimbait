import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { parsePlanFeatures, parseStringList } from '@/lib/db/commerce';
import { saveServicePlan } from '@/lib/admin/actions/commerce';
import PageHeader from '@/components/admin/PageHeader';
import PlanForm from '@/components/admin/commerce/PlanForm';

export const metadata = { title: 'עריכת מסלול' };

export default async function EditPlanPage({ params }: { params: { id: string } }) {
  const db = createClient();
  const { data: plan } = await db.from('service_plans').select('*').eq('id', params.id).maybeSingle();
  if (!plan) notFound();
  const { data: prices } = await db.from('service_plan_prices').select('*').eq('plan_id', plan.id).order('sort_order');
  return (
    <div className="max-w-7xl">
      <PageHeader back={{ href: '/admin/commerce/plans/', label: 'כל המסלולים' }} title={plan.name} />
      <PlanForm action={saveServicePlan} plan={plan} prices={prices ?? []} features={parsePlanFeatures(plan.features)} highlights={parseStringList(plan.highlights)} />
    </div>
  );
}
