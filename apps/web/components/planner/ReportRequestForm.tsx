'use client';

/**
 * "שלחו לי את הדוח": one field (email or phone) and an optional name. Creates a
 * `budget_report` lead carrying the estimate (lib/planner/actions.ts).
 */
import { useFormState, useFormStatus } from 'react-dom';
import { CircleCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { requestBudgetReport } from '@/lib/planner/actions';
import { INITIAL_REPORT_REQUEST } from '@/lib/planner/report-request';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} iconStart={<Send className="ltr:rotate-0 rtl:-scale-x-100" />} className="w-full sm:w-auto">
      שלחו לי את הדוח
    </Button>
  );
}

export default function ReportRequestForm({ query }: { query: string }) {
  const [state, action] = useFormState(requestBudgetReport, INITIAL_REPORT_REQUEST);

  if (state.status === 'success') {
    return (
      <div role="status" className="flex gap-3 rounded-2xl bg-success-50 p-4 text-success-700 ring-1 ring-inset ring-success-100">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="text-body-sm">
          <p className="font-bold">תודה! הדוח בדרך אליכם.</p>
          <p>
            צוות בונים בית יחזור אליכם גם עם הצעה לפגישת ייעוץ תקציב, ללא עלות.
            {state.ref && (
              <>
                {' '}
                מספר הפנייה: <span className="num font-semibold">{state.ref}</span>
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  const contactError = state.fieldErrors?.contact;
  const formError = state.status === 'error' && !contactError ? state.message : null;

  return (
    <form action={action} className="relative grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" noValidate>
      <input type="hidden" name="_query" value={query} />
      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor={`report-${HONEYPOT_FIELD}`}>אתר החברה</label>
        <input id={`report-${HONEYPOT_FIELD}`} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
      </div>
      <Field label="אימייל או טלפון" error={contactError} required>
        <Input name="contact" type="text" inputMode="email" autoComplete="email" dir="ltr" placeholder="name@example.com / 050-0000000" />
      </Field>
      <Field label="שם" optional>
        <Input name="full_name" autoComplete="name" />
      </Field>
      <Submit />
      {formError && (
        <p role="alert" className="text-body-sm text-danger-700 sm:col-span-3">
          {formError}
        </p>
      )}
      <p className="text-caption text-ink-600 sm:col-span-3">נשתמש בפרטים רק כדי לשלוח לכם את הדוח ולחזור אליכם. בלי דיוור שלא ביקשתם.</p>
    </form>
  );
}
