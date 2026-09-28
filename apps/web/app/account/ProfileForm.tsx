'use client';

import { useFormState } from 'react-dom';
import { SelectField, SubmitButton, TextField } from '@/components/commerce/FormBits';
import { CONSTRUCTION_STAGES, MEMBER_REGIONS } from '@/lib/constants/community';
import { INITIAL_FORM_STATE } from '@/lib/commerce/forms';
import { saveProfile } from './actions';

const REGION_OPTIONS = MEMBER_REGIONS.map((r) => ({ value: r.slug, label: r.name }));

export default function ProfileForm({
  profile,
}: {
  profile: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    stage: string | null;
    regionSlug: string | null;
    whatsappOptIn: boolean;
    newsletterOptIn: boolean;
  };
}) {
  const [state, action] = useFormState(saveProfile, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="full_name" label="שם מלא" errors={state.errors} defaultValue={profile.fullName} autoComplete="name" />
        <TextField
          name="phone"
          label="טלפון"
          type="tel"
          errors={state.errors}
          defaultValue={profile.phone}
          autoComplete="tel"
          required={false}
          dir="ltr"
        />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">אימייל</p>
        <p dir="ltr" className="text-end text-gray-600">
          {profile.email}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="stage"
          label="שלב בנייה"
          placeholder="בחרו שלב"
          options={CONSTRUCTION_STAGES}
          errors={state.errors}
          defaultValue={profile.stage}
          required={false}
        />
        <SelectField
          name="region"
          label="אזור בנייה"
          placeholder="בחרו אזור"
          options={REGION_OPTIONS}
          errors={state.errors}
          defaultValue={profile.regionSlug}
          required={false}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-gray-700">עדכונים</legend>
        <label className="flex items-center gap-2 text-gray-700">
          <input type="checkbox" name="whatsapp_opt_in" defaultChecked={profile.whatsappOptIn} className="h-4 w-4 rounded border-gray-300" />
          אשמח להצטרף לקבוצת הווטסאפ האזורית
        </label>
        <label className="flex items-center gap-2 text-gray-700">
          <input type="checkbox" name="newsletter_opt_in" defaultChecked={profile.newsletterOptIn} className="h-4 w-4 rounded border-gray-300" />
          אשמח לקבל טיפים ועדכונים רלוונטיים במייל
        </label>
      </fieldset>
      {state.message && (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={`rounded-xl px-4 py-3 text-sm ${state.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
        >
          {state.message}
        </p>
      )}
      <SubmitButton className="rounded-xl bg-primary px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60">
        שמירת פרטים
      </SubmitButton>
    </form>
  );
}
