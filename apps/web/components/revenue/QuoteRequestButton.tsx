'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { CircleCheck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { BUILD_STAGES } from '@/lib/stages';
import { requestQuoteAction, type QuoteState } from '@/lib/revenue/actions/quote';
import ProjectFileField from './ProjectFileField';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth loading={pending} disabled={pending}>
      שליחת הבקשה
    </Button>
  );
}

/**
 * "בקשת הצעת מחיר" on a business page: a short form whose lead carries the
 * visitor's project file to the business (and the owner's dashboards).
 */
export default function QuoteRequestButton({ businessId, businessName, className }: { businessId: string; businessName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState<QuoteState, FormData>(requestQuoteAction, { status: 'idle' });
  const err = state.status === 'error' ? state.fieldErrors ?? {} : {};

  return (
    <>
      <Button type="button" variant="outline" size="lg" iconStart={<FileText />} onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        בקשת הצעת מחיר
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`הצעת מחיר מ${businessName}`}
        description="ספרו בקצרה מה צריך. הבקשה תגיע לבעל המקצוע עם פרטי הפרויקט שלכם, כדי שההצעה תהיה מדויקת."
      >
        {state.status === 'sent' ? (
          <div role="status" className="rounded-2xl bg-success-50 p-5 text-center">
            <CircleCheck aria-hidden="true" className="mx-auto size-8 text-success-700" />
            <p className="mt-2 text-title text-ink-900">הבקשה נשלחה</p>
            <p className="mt-1 text-body-sm text-ink-700">{businessName} יחזרו אליכם בהקדם.</p>
            {state.ref && (
              <p className="mt-2 text-sm text-ink-600">
                מספר הפנייה: <span dir="ltr" className="font-mono font-semibold">{state.ref}</span>
              </p>
            )}
          </div>
        ) : (
          <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <input type="hidden" name="business_id" value={businessId} />
            <ProjectFileField />
            <div aria-hidden="true" className="absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
              <label>
                אתר החברה
                <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {state.status === 'error' && !state.fieldErrors && (
              <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700 sm:col-span-2">
                {state.message}
              </p>
            )}
            <Field label="מה צריך?" required error={err.message} className="sm:col-span-2">
              <Textarea name="message" rows={3} placeholder="למשל: חלונות אלומיניום לבית של 200 מ״ר, 14 פתחים" />
            </Field>
            <Field label="שם מלא" required error={err.full_name} className="sm:col-span-2">
              <Input name="full_name" autoComplete="name" />
            </Field>
            <Field label="טלפון" required error={err.phone}>
              <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className="text-end" />
            </Field>
            <Field label="אימייל" required error={err.email}>
              <Input name="email" type="email" autoComplete="email" dir="ltr" className="text-end" />
            </Field>
            <Field label="אזור" optional error={err.region}>
              <Select name="region" placeholder="בחרו אזור" defaultValue="">
                {MEMBER_REGIONS.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="שלב בבנייה" optional>
              <Select name="stage" placeholder="בחרו שלב" defaultValue="">
                {BUILD_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Submit />
              <p className="mt-2 text-center text-caption text-ink-500">ללא עלות וללא התחייבות.</p>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
