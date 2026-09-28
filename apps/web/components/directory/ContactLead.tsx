'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  type LeadFormState,
  contactBusinessAction,
  getLeadPrefill,
  revealPhoneAction,
} from '@/app/business/[slug]/actions';
import { CONSTRUCTION_STAGES, REGIONS } from '@/lib/constants/community';
import { telHref } from '@/lib/directory/format';

const input =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const IDLE: LeadFormState = { status: 'idle' };

type Prefill = { fullName: string; email: string; phone: string };

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
    >
      {pending ? 'שולח…' : children}
    </button>
  );
}

function FieldError({ state, name }: { state: LeadFormState; name: string }) {
  const msg = state.status === 'error' ? state.fieldErrors?.[name] : undefined;
  return msg ? <span className="mt-1 block text-xs text-red-600">{msg}</span> : null;
}

/** Hidden honeypot + business id, shared by both forms. */
function HiddenFields({ businessId }: { businessId: string }) {
  return (
    <>
      <input type="hidden" name="business_id" value={businessId} />
      <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          אתר
          <input type="text" name="website_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
    </>
  );
}

function PersonFields({ state, prefill }: { state: LeadFormState; prefill: Prefill | null }) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">שם מלא *</span>
        <input name="full_name" required autoComplete="name" defaultValue={prefill?.fullName} className={input} />
        <FieldError state={state} name="full_name" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">אימייל *</span>
        <input name="email" type="email" required autoComplete="email" dir="ltr" defaultValue={prefill?.email} className={`${input} text-end`} />
        <FieldError state={state} name="email" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">נייד *</span>
        <input
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          dir="ltr"
          minLength={9}
          defaultValue={prefill?.phone}
          className={`${input} text-end`}
        />
        <FieldError state={state} name="phone" />
      </label>
    </>
  );
}

function Revealed({ state, businessName }: { state: Extract<LeadFormState, { status: 'revealed' }>; businessName: string }) {
  if (!state.phone && state.otherPhones.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-amber-800">
        תודה! הפרטים שלכם הועברו, וצוות בונים בית יחבר אתכם ל{businessName} בהקדם.
      </p>
    );
  }
  const phones = [state.phone, ...state.otherPhones].filter((p): p is string => !!p);
  return (
    <div className="space-y-3 text-center">
      <p className="text-gray-700">תודה! אפשר ליצור קשר עם {businessName}:</p>
      {phones.map((p) => (
        <a
          key={p}
          href={telHref(p)}
          dir="ltr"
          className="block rounded-xl border-2 border-primary px-4 py-3 text-xl font-bold text-primary hover:bg-primary-50"
        >
          {p}
        </a>
      ))}
      {state.whatsapp && (
        <a
          href={state.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white hover:opacity-90"
        >
          שליחת הודעה בוואטסאפ
        </a>
      )}
      <p className="text-xs text-gray-500">ספרו שהגעתם דרך בונים בית</p>
    </div>
  );
}

/**
 * Lead-gated contact: the "הצג טלפון" button opens a popup (name, email,
 * mobile, terms). Only after the server records the lead does it return the
 * phone + WhatsApp link. The number is never in the page HTML.
 */
export function ShowPhoneButton({
  businessId,
  businessName,
  className,
}: {
  businessId: string;
  businessName: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useFormState(revealPhoneAction, IDLE);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [cached, setCached] = useState<LeadFormState | null>(null);
  const storageKey = `bb-phone-${businessId}`;

  // Keep a revealed number for the rest of the browser session.
  useEffect(() => {
    if (state.status === 'revealed') {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // Storage unavailable: nothing to cache.
      }
    }
  }, [state, storageKey]);

  const open = () => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setCached(JSON.parse(saved) as LeadFormState);
    } catch {
      // ignore
    }
    dialogRef.current?.showModal();
    if (!prefill) getLeadPrefill().then((p) => p && setPrefill(p)).catch(() => undefined);
  };

  const shown = state.status === 'revealed' ? state : cached?.status === 'revealed' ? cached : null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          className ??
          'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white transition hover:bg-rose-700'
        }
      >
        <svg aria-hidden="true" viewBox="0 0 40 40" className="h-4 w-4 fill-current">
          <path d="M10 25.9c.7-.4 1.6-.4 2.3 0l3.6 2.1c.8.5 1.8.4 2.5-.2 1.3-1 3.3-2.6 5.1-4.4 1.8-1.8 3.4-3.8 4.4-5.1.6-.7.6-1.7.2-2.5l-2.1-3.6c-.4-.7-.4-1.6 0-2.3l5.2-8.9c.5-.9 1.5-1.3 2.5-1 .9.2 2.2.8 3.5 2.1 4 4 6.2 10.8-9 25.9s-21.9 13-25.9 9c-1.3-1.3-1.8-2.5-2.1-3.5-.2-1 .2-2 1-2.5 2.1-1.2 6.7-3.9 8.8-5.1z" />
        </svg>
        הצג טלפון
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`phone-title-${businessId}`}
        className="w-[min(92vw,28rem)] rounded-2xl p-0 backdrop:bg-black/50"
      >
        <div className="relative p-6">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="סגירה"
            className="absolute end-3 top-3 rounded-full p-2 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
          <h2 id={`phone-title-${businessId}`} className="mb-2 text-xl font-bold text-gray-900">
            בונים יקרים,
          </h2>
          {shown ? (
            <Revealed state={shown} businessName={businessName} />
          ) : (
            <form action={formAction} className="relative space-y-3" noValidate>
              <p className="text-sm text-gray-600">
                כדי שנוכל לעקוב שהשירות שקיבלתם היה טוב, ולשמור באתר רק בעלי מקצוע שבאמת עומדים בסטנדרט, נשמח
                שתשאירו פרטים.
              </p>
              <HiddenFields businessId={businessId} />
              <PersonFields state={state} prefill={prefill} />
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" name="terms" required className="mt-1" />
                <span>
                  קראתי ואני מאשר/ת את{' '}
                  <Link href="/תקנון-האתר/" target="_blank" className="text-primary underline">
                    התקנון
                  </Link>
                </span>
              </label>
              <FieldError state={state} name="terms" />
              {state.status === 'error' && !state.fieldErrors && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {state.message}
                </p>
              )}
              <SubmitButton>הצג מספר טלפון</SubmitButton>
              <p className="text-xs text-gray-500">
                בונים בית פועלת בשביל לבחור בקפידה את אנשי המקצוע המומלצים ולאפשר לך ליהנות מספק בעל המלצות וניסיון
                לפרויקט שלך.
              </p>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Sidebar form "יצירת קשר עם …" (live CF7 popup-form-business). */
export function ContactBusinessForm({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [state, formAction] = useFormState(contactBusinessAction, IDLE);
  if (state.status === 'contact_sent') {
    return (
      <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
        תודה! הפנייה שלכם ל{businessName} התקבלה ותטופל בהקדם.
      </p>
    );
  }
  return (
    <form action={formAction} className="relative space-y-3" noValidate>
      <HiddenFields businessId={businessId} />
      <PersonFields state={state} prefill={null} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">בחר מיקום פרוייקט *</span>
        <select name="region" required defaultValue="" className={input}>
          <option value="" disabled>
            בחרו אזור
          </option>
          {REGIONS.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
        <FieldError state={state} name="region" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">שלב הבניה שלך *</span>
        <select name="stage" required defaultValue="" className={input}>
          <option value="" disabled>
            בחרו שלב
          </option>
          {CONSTRUCTION_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <FieldError state={state} name="stage" />
      </label>
      {state.status === 'error' && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}
      <SubmitButton>צור קשר</SubmitButton>
    </form>
  );
}
