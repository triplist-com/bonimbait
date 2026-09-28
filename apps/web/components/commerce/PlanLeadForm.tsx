import LeadForm from '@/components/leads/LeadForm';
import { MEMBER_REGION_OPTIONS } from '@/lib/leads/fields';
import type { LeadField } from '@/lib/leads/types';
import { servicePlanLeadAction } from '@/lib/commerce/actions';

/** "Leave details" on /membership-tiers/ → `service_plan` lead → /thank-you/. */
export default function PlanLeadForm({ plans }: { plans: ReadonlyArray<{ slug: string; name: string }> }) {
  const fields: LeadField[] = [
    { name: 'full_name', label: 'שם מלא', type: 'text', required: true, width: 'half', autoComplete: 'name' },
    { name: 'phone', label: 'טלפון', type: 'tel', required: true, width: 'half', autoComplete: 'tel' },
    { name: 'email', label: 'כתובת דוא״ל', type: 'email', width: 'half', autoComplete: 'email' },
    { name: 'region', label: 'אזור בנייה', type: 'select', options: MEMBER_REGION_OPTIONS, placeholder: 'בחרו אזור', width: 'half' },
    {
      name: 'plan',
      label: 'מסלול שמעניין אתכם',
      type: 'select',
      options: plans.map((p) => ({ value: p.slug, label: p.name })),
      placeholder: 'עוד לא החלטנו',
    },
    { name: 'message', label: 'ספרו לנו על הפרויקט (לא חובה)', type: 'textarea', rows: 3 },
  ];
  return (
    <LeadForm
      type="service_plan"
      fields={fields}
      submitLabel="השאירו פרטים ונחזור אליכם"
      successRedirect="/thank-you/"
      action={servicePlanLeadAction}
      context={{ form: 'membership-tiers' }}
      idPrefix="plan-lead"
    />
  );
}
