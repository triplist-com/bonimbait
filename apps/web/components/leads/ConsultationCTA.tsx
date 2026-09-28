'use client';

/**
 * ConsultationCTA — the site-wide "free budget consultation" call to action.
 *
 * STABLE API (other workstreams import this; keep backwards compatible):
 *
 *   import ConsultationCTA, { WhatsAppChatButton, whatsappHref } from '@/components/leads/ConsultationCTA';
 *
 *   <ConsultationCTA />                                 // variant="button" (default)
 *   <ConsultationCTA variant="banner" source="blog-post" />
 *   <ConsultationCTA variant="card" title="..." description="..." />
 *   <ConsultationCTA variant="floating" />              // fixed bottom corner: consult + WhatsApp (mount once, e.g. layout)
 *   <ConsultationCTA variant="button" label="פגישת ייעוץ" className="..." />
 *   <WhatsAppChatButton message="היי, אשמח לפרטים" />
 *
 * Props (all optional):
 *   variant      'button' | 'banner' | 'card' | 'floating'
 *   source       where the CTA sits; sent as Calendly utm_source and stored on
 *                fallback leads (payload.cta_source). Default 'site'.
 *   label        button text (default "פגישת ייעוץ תקציב בניה ללא עלות")
 *   title, description   banner/card copy
 *   showWhatsApp render the WhatsApp click-to-chat button next to the CTA
 *                (banner/card/floating; default true when a number is set)
 *   className    extra classes on the outer element
 *
 * Every variant opens the same modal:
 *   - Calendly inline booking (NEXT_PUBLIC_CALENDLY_URL, live:
 *     https://calendly.com/tzuri-galili-bonimbayit/demo45min), and
 *   - a fallback "leave your number and we'll call you" LeadForm (type
 *     'consultation'). With no Calendly URL, only the form is shown.
 * WhatsApp uses NEXT_PUBLIC_WHATSAPP_NUMBER (international digits, live 972584020730).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import LeadForm from './LeadForm';
import { CONSULTATION_FIELDS } from '@/lib/leads/fields';

export type ConsultationCTAVariant = 'button' | 'banner' | 'card' | 'floating';

export type ConsultationCTAProps = {
  variant?: ConsultationCTAVariant;
  source?: string;
  label?: string;
  title?: string;
  description?: string;
  showWhatsApp?: boolean;
  className?: string;
};

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL ?? '';
const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');

const DEFAULT_LABEL = 'פגישת ייעוץ תקציב בניה ללא עלות';
const DEFAULT_TITLE = 'איך בונים בית בלי חריגות בתקציב?';
const DEFAULT_DESCRIPTION =
  'פגישת ייעוץ תקציב בניה ללא עלות עם מומחה בונים בית: נבין איפה אתם עומדים, מה צפוי בהמשך ואיך לשמור על התקציב.';

/** wa.me click-to-chat link, or null when no number is configured. */
export function whatsappHref(message = '', number = WHATSAPP_NUMBER): string | null {
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Calendly inline URL with the live site's display params. */
export function calendlyEmbedUrl(source: string, base = CALENDLY_URL): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set('hide_event_type_details', '1');
    url.searchParams.set('hide_gdpr_banner', '1');
    url.searchParams.set('primary_color', 'fc3565');
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'website');
    url.searchParams.set('utm_campaign', 'management');
    return url.toString();
  } catch {
    return null;
  }
}

function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.56.93.95-3.47-.22-.36A9.4 9.4 0 0 1 2.63 12C2.63 6.8 6.86 2.58 12.06 2.58c2.52 0 4.88.98 6.66 2.76a9.35 9.35 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.43 9.43m8.02-17.45A11.27 11.27 0 0 0 12.05.72C5.8.72.72 5.8.72 12.04c0 2 .52 3.94 1.51 5.66L.62 23.28l5.71-1.5a11.3 11.3 0 0 0 5.72 1.46h.01c6.24 0 11.32-5.08 11.33-11.32a11.26 11.26 0 0 0-3.32-8.01" />
    </svg>
  );
}

/** WhatsApp click-to-chat button (renders nothing without a number). */
export function WhatsAppChatButton({
  message = 'היי, אשמח לקבל פרטים על ייעוץ תקציב בניה',
  label = 'שלחו הודעה ב-WhatsApp',
  compact = false,
  className = '',
}: {
  message?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const href = whatsappHref(message);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compact ? label : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-white shadow-md transition hover:brightness-95 ${
        compact ? 'h-14 w-14 rounded-full' : 'px-5 py-3'
      } ${className}`}
    >
      <WhatsAppIcon className={compact ? 'h-7 w-7' : 'h-5 w-5'} />
      {!compact && <span>{label}</span>}
    </a>
  );
}

function ConsultationModal({ open, onClose, source }: { open: boolean; onClose: () => void; source: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const calendly = calendlyEmbedUrl(source);
  const [tab, setTab] = useState<'calendly' | 'callback'>(calendly ? 'calendly' : 'callback');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      aria-labelledby="consultation-title"
      className="w-[min(100vw-2rem,44rem)] max-h-[92vh] rounded-2xl p-0 shadow-2xl backdrop:bg-black/50"
      dir="rtl"
    >
      {open && (
        <div className="flex max-h-[92vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
            <div>
              <h2 id="consultation-title" className="text-xl font-bold text-gray-900">
                {DEFAULT_TITLE}
              </h2>
              <p className="mt-1 text-sm text-gray-600">בונים בית או משפצים? קבעו פגישת ייעוץ תקציב ללא עלות.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגירה"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {calendly && (
            <div role="tablist" className="flex gap-2 px-5 pt-4">
              {(
                [
                  ['calendly', 'קביעת פגישה ביומן'],
                  ['callback', 'השאירו מספר ונחזור אליכם'],
                ] as const
              ).map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                    tab === key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-y-auto p-5">
            {tab === 'calendly' && calendly ? (
              <iframe
                src={calendly}
                title="קביעת פגישת ייעוץ ב-Calendly"
                className="h-[640px] w-full rounded-xl border-0"
                loading="lazy"
              />
            ) : (
              <LeadForm
                type="consultation"
                fields={CONSULTATION_FIELDS}
                submitLabel="חזרו אליי"
                context={{ cta_source: source }}
                successTitle="תודה! קיבלנו את הפרטים"
                successMessage="נציג בונים בית יחזור אליכם בהקדם לתיאום פגישת הייעוץ."
                footnote="המידע שלכם מאובטח ולא ישותף"
                idPrefix={`consult-${source}`}
              />
            )}
            <div className="mt-4 flex justify-center">
              <WhatsAppChatButton />
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

export default function ConsultationCTA({
  variant = 'button',
  source = 'site',
  label = DEFAULT_LABEL,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  showWhatsApp = true,
  className = '',
}: ConsultationCTAProps) {
  const [open, setOpen] = useState(false);
  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  const modal = <ConsultationModal open={open} onClose={closeModal} source={source} />;

  const primaryButton = (extra = '') => (
    <button
      type="button"
      onClick={openModal}
      aria-haspopup="dialog"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-3 font-semibold text-gray-900 shadow-md transition hover:bg-secondary-600 ${extra}`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
      </svg>
      {label}
    </button>
  );

  if (variant === 'floating') {
    return (
      <>
        <div className={`fixed bottom-4 end-4 z-40 flex flex-col items-end gap-3 print:hidden ${className}`}>
          <button
            type="button"
            onClick={openModal}
            aria-haspopup="dialog"
            className="rounded-full bg-secondary px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg transition hover:bg-secondary-600"
          >
            לייעוץ תקציב בניה ראשוני חינם
          </button>
          {showWhatsApp && <WhatsAppChatButton compact label="דברו איתנו ב-WhatsApp" className="shadow-lg" />}
        </div>
        {modal}
      </>
    );
  }

  if (variant === 'banner') {
    return (
      <>
        <section
          className={`rounded-2xl bg-gradient-to-l from-primary-700 to-primary-600 p-6 text-white shadow-card sm:p-8 ${className}`}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
              <p className="mt-2 text-primary-100">{description}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:shrink-0">
              {primaryButton()}
              {showWhatsApp && <WhatsAppChatButton />}
            </div>
          </div>
        </section>
        {modal}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <>
        <aside className={`rounded-2xl border border-gray-100 bg-white p-6 shadow-card ${className}`}>
          <p className="text-sm font-semibold text-primary">ייעוץ ללא עלות</p>
          <h3 className="mt-1 text-lg font-bold text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-600">{description}</p>
          <div className="mt-4 flex flex-col gap-3">
            {primaryButton('w-full')}
            {showWhatsApp && <WhatsAppChatButton className="w-full" />}
          </div>
        </aside>
        {modal}
      </>
    );
  }

  return (
    <>
      {primaryButton(className)}
      {modal}
    </>
  );
}
