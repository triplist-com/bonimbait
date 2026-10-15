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
 *   <ConsultationCTA variant="floating" />              // the site's single floating action (mount once, in the layout)
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
 *   size         button size: 'sm' | 'md' | 'lg' | 'xl' (design system)
 *   buttonVariant design-system Button variant (default 'primary'; 'inverse' on magenta)
 *   fullWidth    stretch the button
 *   className    extra classes on the outer element
 *
 * Every variant opens the same modal:
 *   - Calendly inline booking (NEXT_PUBLIC_CALENDLY_URL, live:
 *     https://calendly.com/tzuri-galili-bonimbayit/demo45min), and
 *   - a fallback "leave your number and we'll call you" LeadForm (type
 *     'consultation'). With no Calendly URL, only the form is shown.
 * WhatsApp uses NEXT_PUBLIC_WHATSAPP_NUMBER (international digits, live 972584020730).
 *
 * The floating variant is one round button that never sits over content: it
 * appears when the visitor scrolls up and fades out at rest, and stays hidden
 * over the hero, the footer and any `data-floating-cta="hide"` band (banner
 * and card variants carry that marker). See lib/ui/floating-action.ts.
 */
import { useCallback, useState } from 'react';
import { CalendarCheck, PhoneCall } from 'lucide-react';
import LeadForm from './LeadForm';
import FloatingAction from './FloatingAction';
import { CONSULTATION_FIELDS } from '@/lib/leads/fields';
import { track } from '@/lib/analytics/track';
import { useCalendlyTracking } from '@/lib/analytics/calendly';
import { cn } from '@/lib/cn';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

export type ConsultationCTAVariant = 'button' | 'banner' | 'card' | 'floating';

export type ConsultationCTAProps = {
  variant?: ConsultationCTAVariant;
  source?: string;
  label?: string;
  title?: string;
  description?: string;
  showWhatsApp?: boolean;
  size?: ButtonSize;
  buttonVariant?: ButtonVariant;
  fullWidth?: boolean;
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
    url.searchParams.set('primary_color', 'e61559');
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
      className={cn(
        'inline-flex items-center justify-center gap-2 bg-whatsapp font-semibold text-ink-950 transition hover:brightness-95',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900',
        compact ? 'size-14 rounded-full shadow-lift' : 'h-12 rounded-xl px-5',
        className,
      )}
    >
      <WhatsAppIcon className={compact ? 'h-7 w-7' : 'h-5 w-5'} />
      {!compact && <span>{label}</span>}
    </a>
  );
}

type ModalTab = 'calendly' | 'callback';

function ConsultationModal({ open, onClose, source }: { open: boolean; onClose: () => void; source: string }) {
  const calendly = calendlyEmbedUrl(source);
  const [tab, setTab] = useState<ModalTab>(calendly ? 'calendly' : 'callback');
  useCalendlyTracking(source, open && tab === 'calendly');
  const tabs: Array<[ModalTab, string]> = [
    ['calendly', 'קביעת פגישה ביומן'],
    ['callback', 'השאירו מספר ונחזור אליכם'],
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={DEFAULT_TITLE}
      description="בונים בית או משפצים? קבעו פגישת ייעוץ תקציב, ללא עלות וללא התחייבות."
      className="sm:w-[min(100vw-2rem,46rem)]"
    >
      {calendly && (
        <div role="tablist" aria-label="דרך יצירת הקשר" className="mb-5 flex w-full gap-1 rounded-2xl bg-ink-100 p-1">
          {tabs.map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                tab === key ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      {tab === 'calendly' && calendly ? (
        <iframe src={calendly} title="קביעת פגישת ייעוץ ב-Calendly" className="h-[620px] w-full rounded-2xl border-0" loading="lazy" />
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
      <div className="mt-5 flex justify-center">
        <WhatsAppChatButton />
      </div>
    </Dialog>
  );
}

export default function ConsultationCTA({
  variant = 'button',
  source = 'site',
  label = DEFAULT_LABEL,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  showWhatsApp = true,
  size = 'lg',
  buttonVariant = 'primary',
  fullWidth,
  className = '',
}: ConsultationCTAProps) {
  const [open, setOpen] = useState(false);
  const openModal = useCallback(() => {
    track('consultation_clicked', { source, variant });
    setOpen(true);
  }, [source, variant]);
  const closeModal = useCallback(() => setOpen(false), []);
  const modal = <ConsultationModal open={open} onClose={closeModal} source={source} />;

  const primaryButton = (extra = '', buttonSize: ButtonSize = size, wide = fullWidth) => (
    <Button
      onClick={openModal}
      aria-haspopup="dialog"
      variant={buttonVariant}
      size={buttonSize}
      fullWidth={wide}
      iconStart={<CalendarCheck />}
      className={extra}
    >
      {label}
    </Button>
  );

  if (variant === 'floating') {
    return (
      <>
        <FloatingAction onConsult={openModal} whatsappUrl={showWhatsApp ? whatsappHref('היי, אשמח לקבל פרטים על ייעוץ תקציב בניה') : null} className={className} />
        {modal}
      </>
    );
  }

  if (variant === 'banner') {
    return (
      <>
        <section
          data-floating-cta="hide"
          className={cn('relative isolate overflow-hidden rounded-3xl bg-ink-950 p-6 text-white shadow-lift sm:p-10', className)}
        >
          <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10 opacity-60" />
          <span aria-hidden="true" className="absolute -end-20 -top-24 -z-10 size-72 rounded-full bg-primary-600/35 blur-3xl" />
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-primary-300">
                <PhoneCall aria-hidden="true" className="size-4" />
                ייעוץ ללא עלות וללא התחייבות
              </p>
              <h2 className="text-headline-sm text-white">{title}</h2>
              <p className="mt-3 text-body text-white/70">{description}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row md:shrink-0">
              {primaryButton('', 'lg', false)}
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
        <aside data-floating-cta="hide" className={cn('rounded-3xl border border-sand-200 bg-sand-50 p-6 shadow-card', className)}>
          <p className="text-sm font-bold text-primary-700">ייעוץ ללא עלות</p>
          <h2 className="mt-1 text-title-lg text-ink-900">{title}</h2>
          <p className="mt-2 text-body-sm text-ink-600">{description}</p>
          <div className="mt-5 flex flex-col gap-3">
            {primaryButton('', 'lg', true)}
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
