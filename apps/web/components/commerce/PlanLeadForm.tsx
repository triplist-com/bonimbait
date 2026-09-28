'use client';

import { useFormState } from 'react-dom';
import { labelClass, inputClass } from '@/components/auth/AuthCard';
import { submitServicePlanLead } from '@/lib/commerce/actions';
import { INITIAL_FORM_STATE, MEMBER_REGIONS } from '@/lib/commerce/forms';
import { FormMessage, Honeypot, PrivacyCheckbox, SelectField, SubmitButton, TextField } from './FormBits';

const REGION_OPTIONS = MEMBER_REGIONS.map((r) => ({ value: r.slug, label: r.name }));

/** "Leave details" form on /membership-tiers/ -> `service_plan` lead -> /thank-you/. */
export default function PlanLeadForm({ plans }: { plans: ReadonlyArray<{ slug: string; name: string }> }) {
  const [state, action] = useFormState(submitServicePlanLead, INITIAL_FORM_STATE);
  return (
    <form action={action} className="relative space-y-4" noValidate>
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="full_name" label="שם מלא" errors={state.errors} autoComplete="name" />
        <TextField name="phone" label="טלפון" type="tel" errors={state.errors} autoComplete="tel" dir="ltr" />
        <TextField name="email" label="אימייל" type="email" errors={state.errors} autoComplete="email" dir="ltr" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="region" label="אזור בנייה" placeholder="בחרו אזור" options={REGION_OPTIONS} errors={state.errors} />
        <SelectField
          name="plan"
          label="מסלול שמעניין אתכם"
          placeholder="עוד לא החלטנו"
          options={plans.map((p) => ({ value: p.slug, label: p.name }))}
          errors={state.errors}
          required={false}
        />
      </div>
      <div>
        <label htmlFor="f-message" className={labelClass}>
          ספרו לנו על הפרויקט (לא חובה)
        </label>
        <textarea id="f-message" name="message" rows={3} className={inputClass} />
      </div>
      <PrivacyCheckbox errors={state.errors} />
      <FormMessage message={state.message} />
      <SubmitButton>השאירו פרטים ונחזור אליכם</SubmitButton>
    </form>
  );
}
