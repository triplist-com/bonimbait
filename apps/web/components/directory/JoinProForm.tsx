'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { type JoinState, joinProAction } from '@/app/join-us/actions';
import { REGIONS } from '@/lib/constants/community';

const input =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const IDLE: JoinState = { status: 'idle' };

function Err({ state, name }: { state: JoinState; name: string }) {
  const msg = state.status === 'error' ? state.fieldErrors?.[name] : undefined;
  return msg ? <span className="mt-1 block text-xs text-red-600">{msg}</span> : null;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
      {pending ? 'שולח…' : 'שלח'}
    </button>
  );
}

export default function JoinProForm({
  specialties,
  signedIn,
}: {
  specialties: Array<{ id: string; name: string }>;
  signedIn: boolean;
}) {
  const [state, action] = useFormState(joinProAction, IDLE);

  if (state.status === 'sent') {
    return (
      <div role="status" className="rounded-xl bg-emerald-50 p-5 text-emerald-800">
        <p className="text-lg font-semibold">תודה! הפרטים התקבלו.</p>
        <p className="mt-1">נציג מטעמנו ייצור עמכם קשר בהקדם לבירור צרכים.</p>
        {state.draftCreated && (
          <p className="mt-2">
            יצרנו עבורכם טיוטת פרופיל שממתינה לאישור. אפשר לעקוב אחריה ב
            <Link href="/partner-portal/" className="font-semibold underline">
              פורטל העסקים
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="relative space-y-4" noValidate>
      <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <input type="text" name="company_website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">שם העסק *</span>
        <input name="business_name" required maxLength={120} autoComplete="organization" className={input} />
        <Err state={state} name="business_name" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">טלפון *</span>
          <input name="phone" type="tel" required dir="ltr" autoComplete="tel" className={`${input} text-end`} />
          <Err state={state} name="phone" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">כתובת דוא&quot;ל *</span>
          <input name="email" type="email" required dir="ltr" autoComplete="email" className={`${input} text-end`} />
          <Err state={state} name="email" />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-gray-700">מיקומי עבודה *</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-gray-200 p-3 sm:grid-cols-3">
          {REGIONS.map((r) => (
            <label key={r.slug} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="regions" value={r.slug} />
              {r.name}
            </label>
          ))}
        </div>
        <Err state={state} name="regions" />
      </fieldset>
      {specialties.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">תחום התמחות</span>
          <select name="specialty_id" defaultValue="" className={input}>
            <option value="">בחרו תחום (לא חובה)</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">ספרו לנו על העסק בכמה מילים</span>
        <textarea name="about" rows={4} maxLength={3000} className={input} />
      </label>
      {state.status === 'error' && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <Submit />
      {!signedIn && (
        <p className="text-center text-xs text-gray-500">
          יש לכם חשבון?{' '}
          <Link href="/login/?next=/join-us/" className="text-primary underline">
            התחברו
          </Link>{' '}
          וניצור עבורכם גם טיוטת פרופיל עסקי לניהול עצמי.
        </p>
      )}
    </form>
  );
}
