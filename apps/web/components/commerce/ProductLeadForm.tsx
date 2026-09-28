'use client';

import { useFormState } from 'react-dom';
import { submitProductLead } from '@/lib/commerce/actions';
import { INITIAL_FORM_STATE, LEAD_STAGES, MEMBER_REGIONS } from '@/lib/commerce/forms';
import { FormMessage, Honeypot, PrivacyCheckbox, SelectField, SubmitButton, TextField } from './FormBits';

const REGION_OPTIONS = MEMBER_REGIONS.map((r) => ({ value: r.slug, label: r.name }));

/**
 * "מעוניינים במוצר? השאירו פרטים ונחזור אליכם" — the live product-page form.
 * Creates a `benefit` lead and redirects to /תודה-על-השארת-פרטים-מוצר/.
 */
export default function ProductLeadForm({
  productId,
  heading,
  urgentOption,
}: {
  productId: string;
  heading: string;
  urgentOption: boolean;
}) {
  const [state, action] = useFormState(submitProductLead, INITIAL_FORM_STATE);
  const [lead, ...rest] = heading.split('?');

  return (
    <section
      aria-labelledby="product-lead-heading"
      className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6"
    >
      <h2 id="product-lead-heading" className="mb-4 text-lg text-gray-900">
        {rest.length ? (
          <>
            <strong>{lead}?</strong> {rest.join('?').trim()}
          </>
        ) : (
          <strong>{heading}</strong>
        )}
      </h2>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="product_id" value={productId} />
        <Honeypot />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField name="full_name" label="שם מלא" errors={state.errors} autoComplete="name" />
          <TextField name="phone" label="טלפון" type="tel" errors={state.errors} autoComplete="tel" dir="ltr" />
          <TextField name="email" label="אימייל" type="email" errors={state.errors} autoComplete="email" dir="ltr" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="region"
            label="מיקום פרויקט"
            placeholder="בחר מיקום פרוייקט"
            options={REGION_OPTIONS}
            errors={state.errors}
          />
          <SelectField name="stage" label="שלב בניה" placeholder="בחר שלב בניה" options={LEAD_STAGES} errors={state.errors} />
        </div>
        {urgentOption && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" name="urgent" className="mt-1 h-4 w-4 rounded border-gray-300" />
            <span>אופציונלי: יש לי צורך מיידי במחמם ואשמח לפנייה מוקדמת</span>
          </label>
        )}
        <PrivacyCheckbox errors={state.errors} />
        <FormMessage message={state.message} />
        <SubmitButton>חזרו אליי</SubmitButton>
        <p className="text-xs text-gray-500">* יצירת הקשר תתבצע במהלך 60 הימים הקרובים</p>
      </form>
    </section>
  );
}
