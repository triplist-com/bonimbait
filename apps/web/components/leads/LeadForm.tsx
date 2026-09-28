'use client';

/**
 * LeadForm — generic RTL lead form driven by a field schema.
 *
 *   <LeadForm
 *     type="contact"
 *     fields={CONTACT_FIELDS}            // LeadField[] (lib/leads/types.ts)
 *     submitLabel="שלח"
 *     successRedirect="/thank-you/"      // or omit and use successMessage
 *     businessId={business.id}           // optional links: productId, servicePlanId
 *     context={{ product_name: 'פזגז' }} // small extra values stored on the lead
 *   />
 *
 * - Posts to the `submitLeadAction` Server Action (or a custom `action` with
 *   the same signature), which calls submitLead(): zod validation, honeypot,
 *   rate limit, optional Turnstile, service-role insert, notification.
 * - Field `name`s must match lib/leads/schemas.ts (full_name, phone, email,
 *   region, construction_stage, message, company, category, ...).
 * - Hebrew validation runs in the browser first; server field errors are shown
 *   under the same inputs.
 * - On success: redirects to `successRedirect`, or shows `successMessage`
 *   inline (and the WhatsApp invite button for whatsapp_join).
 * - Captures the page path and utm_* / gclid / fbclid automatically.
 */
import { useEffect, useId, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Script from 'next/script';
import type { LeadType } from '@/lib/db/types';
import { submitLeadAction } from '@/lib/leads/actions';
import { HONEYPOT_FIELD } from '@/lib/leads/constants';
import { INITIAL_LEAD_FORM_STATE, type LeadField, type LeadFormState } from '@/lib/leads/types';

export type LeadFormProps = {
  type: LeadType;
  fields: readonly LeadField[];
  submitLabel: string;
  pendingLabel?: string;
  /** Internal path to redirect to after a successful submission. */
  successRedirect?: string;
  successTitle?: string;
  successMessage?: string;
  businessId?: string;
  productId?: string;
  servicePlanId?: string;
  /** Extra context stored in the lead payload (sent as _ctx_<key>). */
  context?: Record<string, string>;
  action?: (state: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  /** Text under the submit button (e.g. privacy note). */
  footnote?: string;
  className?: string;
  /** Stable id prefix when several forms share a page. */
  idPrefix?: string;
};

const inputBase =
  'w-full rounded-xl border bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2';
const inputOk = 'border-gray-200 focus:border-primary focus:ring-primary/20';
const inputBad = 'border-red-400 focus:border-red-500 focus:ring-red-200';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

function validateClient(fields: readonly LeadField[], form: HTMLFormElement): Record<string, string> {
  const errors: Record<string, string> = {};
  const data = new FormData(form);
  for (const f of fields) {
    if (f.type === 'checkbox') {
      if (f.required && data.get(f.name) === null) errors[f.name] = f.requiredMessage ?? 'יש לסמן את התיבה';
      continue;
    }
    const value = String(data.get(f.name) ?? '').trim();
    if (!value) {
      if (f.required) errors[f.name] = f.requiredMessage ?? (f.type === 'select' ? 'יש לבחור מהרשימה' : 'שדה חובה');
      continue;
    }
    if (f.type === 'email' && !EMAIL_RE.test(value)) errors[f.name] = 'נא להזין כתובת אימייל תקינה';
    if (f.type === 'tel' && value.replace(/\D/g, '').length < 9) errors[f.name] = 'נא להזין מספר טלפון תקין (לפחות 9 ספרות)';
  }
  return errors;
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
    >
      {pending ? pendingLabel ?? 'שולח...' : label}
    </button>
  );
}

export default function LeadForm({
  type,
  fields,
  submitLabel,
  pendingLabel,
  successRedirect,
  successTitle = 'תודה! הפרטים התקבלו',
  successMessage = 'נחזור אליכם בהקדם.',
  businessId,
  productId,
  servicePlanId,
  context,
  action = submitLeadAction,
  footnote,
  className = '',
  idPrefix,
}: LeadFormProps) {
  const autoId = useId();
  const prefix = idPrefix ?? `lead-${autoId.replace(/:/g, '')}`;
  const [state, formAction] = useFormState(action, INITIAL_LEAD_FORM_STATE);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [utm, setUtm] = useState('');

  useEffect(() => {
    let path = window.location.pathname;
    try {
      path = decodeURI(path);
    } catch {
      // keep encoded path
    }
    setSource(path);
    const params = new URLSearchParams(window.location.search);
    const picked: Record<string, string> = {};
    params.forEach((v, k) => {
      if (/^(utm_[a-z]+|gclid|fbclid)$/.test(k)) picked[k] = v;
    });
    if (Object.keys(picked).length) setUtm(JSON.stringify(picked));
  }, []);

  // New server response: client-side errors are no longer relevant.
  useEffect(() => {
    setClientErrors({});
  }, [state.submittedAt]);

  if (state.status === 'success') {
    return (
      <div className={`rounded-2xl border border-green-200 bg-green-50 p-6 text-center ${className}`} role="status">
        <p className="text-lg font-bold text-gray-900">{state.invite ? 'ברוכים הבאים!' : successTitle}</p>
        {state.invite ? (
          <>
            <p className="mt-1 text-gray-700">ההרשמה התקבלה. לחצו להצטרפות לקבוצה באזור שלכם:</p>
            <a
              href={state.invite.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white shadow hover:brightness-95"
            >
              הצטרפו לקבוצת WhatsApp – {state.invite.name}
            </a>
            <p className="mt-3 text-xs text-gray-500">הקבוצות מיועדות לבונים ומשפצים פרטיים בלבד</p>
          </>
        ) : (
          <p className="mt-1 text-gray-700">{successMessage}</p>
        )}
      </div>
    );
  }

  const errorFor = (name: string) => clientErrors[name] ?? state.fieldErrors?.[name];
  const formError = state.status === 'error' ? state.fieldErrors?._form ?? state.message : undefined;

  return (
    <form
      action={formAction}
      noValidate
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${className}`}
      onSubmit={(e) => {
        const errors = validateClient(fields, e.currentTarget);
        setClientErrors(errors);
        if (Object.keys(errors).length) e.preventDefault();
      }}
    >
      <input type="hidden" name="_type" value={type} />
      <input type="hidden" name="_source" value={source} />
      {utm && <input type="hidden" name="_utm" value={utm} />}
      {successRedirect && <input type="hidden" name="_success" value={successRedirect} />}
      {businessId && <input type="hidden" name="_business_id" value={businessId} />}
      {productId && <input type="hidden" name="_product_id" value={productId} />}
      {servicePlanId && <input type="hidden" name="_service_plan_id" value={servicePlanId} />}
      {Object.entries(context ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={`_ctx_${k}`} value={v} />
      ))}

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor={`${prefix}-${HONEYPOT_FIELD}`}>אתר החברה</label>
        <input id={`${prefix}-${HONEYPOT_FIELD}`} type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
      </div>

      {formError && (
        <p role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </p>
      )}

      {fields.map((f) => {
        const id = `${prefix}-${f.name}`;
        const err = errorFor(f.name);
        const span = f.width === 'half' ? '' : 'sm:col-span-2';
        const cls = `${inputBase} ${err ? inputBad : inputOk}`;
        const describedBy = err ? `${id}-error` : undefined;
        const clear = () => err && setClientErrors((prev) => ({ ...prev, [f.name]: '' }));
        const errorNode = err ? (
          <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
            {err}
          </p>
        ) : null;

        if (f.type === 'checkbox') {
          return (
            <div key={f.name} className={span}>
              <label htmlFor={id} className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  id={id}
                  name={f.name}
                  type="checkbox"
                  defaultChecked={f.defaultChecked}
                  aria-invalid={Boolean(err)}
                  aria-describedby={describedBy}
                  onChange={clear}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>
                  {f.label}
                  {f.required && <span className="text-red-600"> *</span>}
                </span>
              </label>
              {errorNode}
            </div>
          );
        }

        const label = (
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
            {f.label}
            {f.required && <span className="text-red-600"> *</span>}
          </label>
        );
        const common = {
          id,
          name: f.name,
          'aria-invalid': Boolean(err),
          'aria-describedby': describedBy,
          'aria-required': f.required || undefined,
          onChange: clear,
          className: cls,
        };

        return (
          <div key={f.name} className={span}>
            {label}
            {f.type === 'textarea' ? (
              <textarea {...common} rows={f.rows ?? 4} placeholder={f.placeholder} defaultValue={f.defaultValue} />
            ) : f.type === 'select' ? (
              <select {...common} defaultValue={f.defaultValue ?? ''}>
                <option value="">{f.placeholder ?? 'בחרו מהרשימה'}</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                type={f.type}
                dir={f.type === 'tel' || f.type === 'email' ? 'ltr' : undefined}
                inputMode={f.type === 'tel' ? 'tel' : undefined}
                autoComplete={f.autoComplete ?? (f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : f.name === 'full_name' ? 'name' : undefined)}
                placeholder={f.placeholder}
                defaultValue={f.defaultValue}
                style={f.type === 'tel' || f.type === 'email' ? { textAlign: 'end' } : undefined}
              />
            )}
            {errorNode}
          </div>
        );
      })}

      {TURNSTILE_SITE_KEY && (
        <div className="sm:col-span-2">
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-language="he" />
        </div>
      )}

      <div className="sm:col-span-2">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        {footnote && <p className="mt-2 text-center text-xs text-gray-500">{footnote}</p>}
      </div>
    </form>
  );
}
