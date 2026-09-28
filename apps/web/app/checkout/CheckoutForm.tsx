'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { inputClass, labelClass } from '@/components/auth/AuthCard';
import { FieldError, FormMessage, SubmitButton, TextField } from '@/components/commerce/FormBits';
import { INITIAL_FORM_STATE } from '@/lib/commerce/forms';
import { placeOrder } from './actions';

export default function CheckoutForm({
  defaults,
  totalLabel,
}: {
  defaults: { fullName: string | null; email: string | null; phone: string | null };
  totalLabel: string;
}) {
  const [state, action] = useFormState(placeOrder, INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" noValidate>
      <TextField name="full_name" label="שם מלא" errors={state.errors} defaultValue={defaults.fullName} autoComplete="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="email"
          label="אימייל"
          type="email"
          errors={state.errors}
          defaultValue={defaults.email}
          autoComplete="email"
          dir="ltr"
        />
        <TextField
          name="phone"
          label="טלפון"
          type="tel"
          errors={state.errors}
          defaultValue={defaults.phone}
          autoComplete="tel"
          dir="ltr"
        />
      </div>
      <TextField name="city" label="יישוב" errors={state.errors} autoComplete="address-level2" required={false} />
      <div>
        <label htmlFor="f-notes" className={labelClass}>
          הערות להזמנה (לא חובה)
        </label>
        <textarea id="f-notes" name="notes" rows={3} className={inputClass} />
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" name="terms" required className="mt-1 h-4 w-4 rounded border-gray-300" />
          <span>
            קראתי ואני מאשר/ת את{' '}
            <Link href="/תקנון-האתר/" target="_blank" className="text-primary underline">
              תקנון האתר
            </Link>
          </span>
        </label>
        <FieldError errors={state.errors} name="terms" />
      </div>
      <FormMessage message={state.message} />
      <SubmitButton>לתשלום מאובטח · {totalLabel}</SubmitButton>
    </form>
  );
}
