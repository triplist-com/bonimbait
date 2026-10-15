import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { COMMUNITY_STATS } from '@/lib/brand';

const PERKS = ['תוכן והמלצות לפי השלב והאזור שלכם', 'הטבות בלעדיות לחברי הקהילה', 'קבוצות WhatsApp אזוריות של בונים כמוכם'];

/** Shared frame for the login/signup pages: the form, and a brand panel on desktop. */
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const whatsapp = COMMUNITY_STATS.find((s) => s.id === 'whatsapp');
  return (
    <div className="relative isolate overflow-hidden bg-sand-50">
      <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
      <div className="container-page grid items-stretch gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,29rem)_1fr] lg:gap-12">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-ink-100 bg-white p-6 shadow-lift sm:p-8 lg:mx-0 lg:max-w-none">
          <h1 className="mb-1 text-center text-headline-sm text-ink-900">{title}</h1>
          {subtitle && <p className="mb-6 text-center text-body text-ink-600">{subtitle}</p>}
          {children}
        </div>
        <aside
          aria-label="למה להצטרף"
          className="relative isolate hidden flex-col justify-between overflow-hidden rounded-[2rem] bg-ink-950 p-10 text-white lg:flex"
        >
          <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10" />
          <span aria-hidden="true" className="absolute -bottom-32 -start-24 -z-10 size-96 rounded-full bg-primary-600/30 blur-3xl" />
          <Logo accent className="h-9 self-start text-white" />
          <div>
            <p className="eyebrow !text-primary-300">אתכם עד המפתח</p>
            <p className="mt-3 text-headline text-white">הבית שלכם מתחיל כאן.</p>
            <ul className="mt-6 space-y-3">
              {PERKS.map((p) => (
                <li key={p} className="flex items-center gap-3 text-body text-white/85">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-600/25 text-primary-300">
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {whatsapp && (
            <p className="text-sm text-white/60">
              <span className="num text-2xl font-extrabold text-white">{whatsapp.value}</span> {whatsapp.label} כבר איתנו בקבוצות WhatsApp
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-ink-900 shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 hover:border-ink-300 focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15 aria-[invalid=true]:border-danger-600';

export const labelClass = 'mb-1.5 block text-sm font-semibold text-ink-800';

export const primaryButtonClass = buttonClasses({ variant: 'primary', size: 'lg', fullWidth: true });

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
      {message}
    </p>
  );
}
