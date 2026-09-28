'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { type ClaimState, claimBusinessAction } from '@/app/business/[slug]/claim/actions';

const input =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const IDLE: ClaimState = { status: 'idle' };

function Err({ state, name }: { state: ClaimState; name: string }) {
  const msg = state.status === 'error' ? state.fieldErrors?.[name] : undefined;
  return msg ? <span className="mt-1 block text-xs text-red-600">{msg}</span> : null;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
      {pending ? 'שולח…' : 'שליחת בקשה'}
    </button>
  );
}

export default function ClaimForm({
  slug,
  businessHref,
  defaults,
}: {
  slug: string;
  businessHref: string;
  defaults: { fullName: string; phone: string; email: string };
}) {
  const [state, action] = useFormState(claimBusinessAction, IDLE);
  if (state.status === 'sent') {
    return (
      <div role="status" className="rounded-xl bg-emerald-50 p-5 text-emerald-800">
        <p className="font-semibold">הבקשה התקבלה!</p>
        <p className="mt-1">צוות בונים בית יאמת את הפרטים וייצור איתכם קשר. לאחר האישור תוכלו לנהל את העסק בפורטל העסקים.</p>
        <Link href={businessHref} className="mt-3 inline-block font-semibold text-primary underline">
          חזרה לעמוד העסק
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">שם מלא *</span>
        <input name="full_name" required defaultValue={defaults.fullName} className={input} />
        <Err state={state} name="full_name" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">טלפון *</span>
        <input name="phone" type="tel" dir="ltr" required defaultValue={defaults.phone} className={`${input} text-end`} />
        <Err state={state} name="phone" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">אימייל *</span>
        <input name="email" type="email" dir="ltr" required defaultValue={defaults.email} className={`${input} text-end`} />
        <Err state={state} name="email" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">תפקיד בעסק</span>
        <input name="role" placeholder="בעלים, מנהל/ת שיווק…" className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">הערות</span>
        <textarea name="message" rows={3} className={input} />
      </label>
      {state.status === 'error' && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <Submit />
    </form>
  );
}
