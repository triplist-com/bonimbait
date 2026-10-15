'use client';

/**
 * The consult booking sheet (opened by every ConsultationCTA variant).
 *
 *   1. "התיק שלכם": the visitor's project file + name/phone/email (and region/
 *      stage only if the file lacks them). Submitting creates the
 *      `consultation` lead WITH the file, before anything else.
 *   2. Calendly, prefilled with name and email, the lead ref in utm_content.
 *      `calendly.event_scheduled` marks that lead booked.
 *   3. Done: the ref and what happens next.
 * "העדפתי שתחזרו אליי" stores the same lead and skips Calendly. Without a
 * Calendly URL the sheet is the call-back form. If leads can't be stored
 * (Supabase not configured) Calendly opens directly, as before.
 *
 * A bottom sheet on phones, a dialog from `sm` up.
 */
import { useCallback, useEffect, useId, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, CalendarCheck, CircleCheck, PhoneCall } from 'lucide-react';
import { Dialog, Drawer } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { Steps } from '@/components/ui/Steps';
import { MEMBER_REGIONS } from '@/lib/constants/community';
import { BUILD_STAGES } from '@/lib/stages';
import { useCalendlyTracking } from '@/lib/analytics/calendly';
import { collectProjectFile } from '@/lib/project-file/collect';
import type { ProjectFile } from '@/lib/project-file/types';
import { calendlyBookingUrl } from '@/lib/revenue/calendly';
import { markConsultBooked, startConsultBooking, type BookingMode } from '@/lib/revenue/actions/booking';
import ProjectFileSummary from './ProjectFileSummary';

type Step = 'details' | 'calendly' | 'done';
type Lead = { ref: string; token: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

function validate(fd: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(fd.get('full_name') ?? '').trim()) errors.full_name = 'נא לכתוב שם';
  if (String(fd.get('phone') ?? '').replace(/\D/g, '').length < 9) errors.phone = 'נא להזין מספר טלפון תקין (לפחות 9 ספרות)';
  const email = String(fd.get('email') ?? '').trim();
  if (email && !EMAIL_RE.test(email)) errors.email = 'נא להזין כתובת אימייל תקינה';
  return errors;
}

export type BookingSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Where the CTA sits (utm_source, payload.cta_source). */
  source: string;
  /** Calendly event URL (NEXT_PUBLIC_CALENDLY_URL); empty = call-back only. */
  calendlyBase: string;
  /** Extra actions under the sheet (the WhatsApp button). */
  footer?: ReactNode;
};

export default function BookingSheet({ open, onClose, source, calendlyBase, footer }: BookingSheetProps) {
  const wide = useIsWide();
  const ids = useId().replace(/:/g, '');
  const [step, setStep] = useState<Step>('details');
  const [file, setFile] = useState<ProjectFile>({ version: 1 });
  const [lead, setLead] = useState<Lead>(null);
  const [person, setPerson] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [mode, setMode] = useState<BookingMode>('calendly');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [pending, start] = useTransition();
  const hasCalendly = Boolean(calendlyBookingUrl(calendlyBase, source));

  // A fresh read of the visitor's file every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setFile(collectProjectFile());
  }, [open]);

  const close = useCallback(() => {
    onClose();
    // Start over next time (after the closing animation).
    setTimeout(() => {
      setStep('details');
      setLead(null);
      setErrors({});
      setFormError(null);
      setBooked(false);
    }, 300);
  }, [onClose]);

  const onScheduled = useCallback(
    (data: unknown) => {
      setBooked(true);
      setStep('done');
      if (lead) void markConsultBooked({ ref: lead.ref, token: lead.token, calendly: data }).catch(() => undefined);
    },
    [lead],
  );
  useCalendlyTracking(source, open && step === 'calendly', { leadRef: lead?.ref, onScheduled });

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const chosen: BookingMode = submitter?.value === 'callback' || !hasCalendly ? 'callback' : 'calendly';
    const fd = new FormData(e.currentTarget);
    const clientErrors = validate(fd);
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length) return;
    const name = String(fd.get('full_name') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    setPerson({ name, email });
    setMode(chosen);
    start(async () => {
      const res = await startConsultBooking({
        fullName: name,
        phone: String(fd.get('phone') ?? ''),
        email: email || undefined,
        region: String(fd.get('region') ?? '') || undefined,
        stage: String(fd.get('stage') ?? '') || undefined,
        projectFile: file,
        source,
        mode: chosen,
        website: String(fd.get('company_website') ?? ''),
      }).catch(() => ({ status: 'error' as const, message: 'משהו השתבש. נסו שוב או התקשרו אלינו.', fieldErrors: undefined }));
      if (res.status === 'created') {
        setLead({ ref: res.ref, token: res.token });
        setStep(chosen === 'calendly' && hasCalendly ? 'calendly' : 'done');
      } else if (res.status === 'unavailable') {
        // Leads can't be stored right now: keep the visitor moving (Calendly as before).
        if (hasCalendly && chosen === 'calendly') setStep('calendly');
        else setFormError(res.message || 'לא ניתן לשלוח כרגע. נסו שוב בעוד רגע.');
      } else {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.fieldErrors && !res.fieldErrors._form ? null : res.message);
      }
    });
  }

  const steps = hasCalendly ? [{ label: 'התיק שלכם' }, { label: 'בחירת מועד' }, { label: 'נקבע' }] : [{ label: 'התיק שלכם' }, { label: 'נחזור אליכם' }];
  const current = step === 'details' ? 0 : step === 'calendly' ? 1 : steps.length;
  const embed = calendlyBookingUrl(calendlyBase, source, { name: person.name, email: person.email, leadRef: lead?.ref });

  const body = (
    <div className="space-y-5" data-floating-cta="hide">
      <Steps steps={steps} current={current} label="שלבי קביעת הפגישה" className="mx-auto max-w-md" />

      {step === 'details' && (
        <>
          <ProjectFileSummary file={file} />
          <form noValidate onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy={pending}>
            {formError && (
              <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700 sm:col-span-2">
                {formError}
              </p>
            )}
            <Field label="שם מלא" required error={errors.full_name} className="sm:col-span-2" id={`${ids}-name`}>
              <Input name="full_name" autoComplete="name" />
            </Field>
            <Field label="טלפון" required error={errors.phone} id={`${ids}-phone`}>
              <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className="text-end" />
            </Field>
            <Field label="אימייל" optional hint="לאישור הפגישה ביומן" error={errors.email} id={`${ids}-email`}>
              <Input name="email" type="email" autoComplete="email" dir="ltr" className="text-end" />
            </Field>
            {!file.regionSlug && (
              <Field label="אזור הבנייה" optional error={errors.region} id={`${ids}-region`}>
                <Select name="region" placeholder="בחרו אזור" defaultValue="">
                  {MEMBER_REGIONS.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {!file.stage && (
              <Field label="איפה אתם עומדים" optional error={errors.construction_stage} id={`${ids}-stage`}>
                <Select name="stage" placeholder="בחרו שלב" defaultValue="">
                  {BUILD_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {/* Honeypot: hidden from people and assistive tech. */}
            <div aria-hidden="true" className="absolute -z-10 h-0 w-0 overflow-hidden opacity-0">
              <label htmlFor={`${ids}-website`}>אתר החברה</label>
              <input id={`${ids}-website`} type="text" name="company_website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              {hasCalendly ? (
                <>
                  <Button
                    type="submit"
                    value="calendly"
                    size="lg"
                    fullWidth
                    loading={pending && mode === 'calendly'}
                    disabled={pending}
                    iconEnd={<ArrowLeft className="ltr:rotate-180" />}
                  >
                    המשיכו לבחירת מועד
                  </Button>
                  <Button
                    type="submit"
                    value="callback"
                    variant="ghost"
                    size="md"
                    fullWidth
                    disabled={pending}
                    loading={pending && mode === 'callback'}
                    iconStart={<PhoneCall />}
                  >
                    העדפתי שתחזרו אליי טלפונית
                  </Button>
                </>
              ) : (
                <Button type="submit" size="lg" fullWidth loading={pending} disabled={pending} iconStart={<PhoneCall />}>
                  חזרו אליי
                </Button>
              )}
              <p className="text-center text-caption text-ink-500">ללא עלות וללא התחייבות. הפרטים משמשים רק לתיאום הייעוץ.</p>
            </div>
          </form>
        </>
      )}

      {step === 'calendly' && (
        <div className="space-y-3">
          {lead && (
            <p className="flex items-center gap-2 rounded-xl bg-success-50 px-4 py-2.5 text-sm text-success-700">
              <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
              <span>
                התיק נשמר (<span dir="ltr" className="font-mono">{lead.ref}</span>). עכשיו בחרו מועד שנוח לכם.
              </span>
            </p>
          )}
          {embed && (
            <iframe src={embed} title="קביעת פגישת ייעוץ ב-Calendly" className="h-[620px] w-full rounded-2xl border-0" loading="lazy" />
          )}
        </div>
      )}

      {step === 'done' && (
        <div role="status" className="rounded-2xl border border-success-100 bg-success-50 p-5 text-center sm:p-6">
          <CalendarCheck aria-hidden="true" className="mx-auto size-9 text-success-700" />
          <p className="mt-3 text-title-lg text-ink-900">{booked ? 'נקבע! הפגישה ביומן' : 'תודה! קיבלנו את הפרטים'}</p>
          <p className="mx-auto mt-2 max-w-md text-body text-ink-700">
            {booked
              ? 'אישור נשלח לאימייל שלכם, והתיק כבר אצל צוות הייעוץ. ניפגש בשיחה.'
              : mode === 'callback' || !hasCalendly
                ? 'נציג בונים בית יחזור אליכם בהקדם לתיאום פגישת הייעוץ. התיק שלכם כבר אצלו.'
                : 'התיק שלכם אצל צוות הייעוץ.'}
          </p>
          {lead && (
            <p className="mt-3 text-sm text-ink-600">
              מספר הפנייה: <span dir="ltr" className="font-mono font-semibold text-ink-900">{lead.ref}</span>
            </p>
          )}
          <Button variant="outline" className="mt-5" onClick={close}>
            סגירה
          </Button>
        </div>
      )}

      {footer && step === 'details' && <div className="flex justify-center">{footer}</div>}
    </div>
  );

  const props = {
    open,
    onClose: close,
    title: 'פגישת ייעוץ תקציב, ללא עלות',
    description: 'שיחה עם מומחה בונים בית: איפה אתם עומדים, מה צפוי בהמשך ואיך לשמור על התקציב.',
  };
  return wide ? (
    <Dialog {...props} className="sm:w-[min(100vw-2rem,46rem)]">
      {body}
    </Dialog>
  ) : (
    <Drawer {...props}>{body}</Drawer>
  );
}
