import type { ReactNode } from 'react';
import { CircleCheck, Mail, Phone, TrendingDown, TrendingUp } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import type { VarianceStatus } from '@/lib/hub/budget';
import { dayMonthLabel } from '@/lib/hub/format';
import { formatPct } from '@/lib/bonimos/budget';
import type { PersonView } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';

/** A Bonim.Os section: white card, an H2 with an optional line and actions. Server-safe. */
export function OsSection({
  id,
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('scroll-mt-24 rounded-3xl border border-ink-100 bg-white p-4 shadow-card sm:p-6', className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span aria-hidden="true" className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 [&_svg]:size-5">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className="text-title-lg text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-body-sm text-ink-600">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A form-level error inside a dialog (announced). */
export function FormError({ children, className }: { children: ReactNode; className?: string }) {
  return <p role="alert" className={cn('rounded-xl bg-danger-50 px-3 py-2 text-body-sm font-semibold text-danger-700', className)}>{children}</p>;
}

/** A KPI tile in the project header. */
export function KpiTile({
  label,
  children,
  hint,
  icon,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-2xl bg-white p-4 shadow-xs ring-1 ring-inset ring-ink-100', className)}>
      <dt className="flex items-center gap-1.5 text-caption font-semibold text-ink-600 [&_svg]:size-4 [&_svg]:text-primary-600">
        {icon && (
          <span aria-hidden="true" className="contents">
            {icon}
          </span>
        )}
        {label}
      </dt>
      <dd className="mt-1 text-title-lg leading-snug text-ink-900">{children}</dd>
      {hint && <dd className="mt-1 text-caption text-ink-600">{hint}</dd>}
    </div>
  );
}

const STATUS_TONE: Record<VarianceStatus, 'success' | 'warning' | 'info' | 'neutral'> = {
  on: 'success',
  under: 'info',
  over: 'warning',
  none: 'neutral',
};

/** "+2.1% מעל התקציב" with an icon (colour is never the only signal). */
export function VariancePctBadge({
  pct,
  status,
  size = 'md',
  short = false,
}: {
  pct: number | null;
  status: VarianceStatus;
  size?: 'sm' | 'md';
  /** Just the number and icon (tables). */
  short?: boolean;
}) {
  if (status === 'none' || pct == null) {
    return (
      <Badge tone="neutral" size={size}>
        עוד אין ביצוע
      </Badge>
    );
  }
  const icon = status === 'over' ? <TrendingUp /> : status === 'under' ? <TrendingDown /> : <CircleCheck />;
  const word = status === 'over' ? 'מעל התקציב' : status === 'under' ? 'מתחת לתקציב' : 'בתקציב';
  return (
    <Badge tone={STATUS_TONE[status]} size={size} icon={icon}>
      <span className="num">{formatPct(pct)}</span>
      {short ? <span className="sr-only">{word}</span> : <span>{word}</span>}
    </Badge>
  );
}

/** A person on the project: avatar, name, title, contact links. */
export function PersonCard({ person, roleLabel, compact = false }: { person: PersonView; roleLabel?: string; compact?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', !compact && 'rounded-2xl bg-white p-3 shadow-xs ring-1 ring-inset ring-ink-100')}>
      <Avatar name={person.name} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0">
        <p className="truncate text-body-sm font-bold text-ink-900">{person.name}</p>
        <p className="truncate text-caption text-ink-600">{roleLabel ?? person.title ?? (person.role === 'manager' ? 'מנהל/ת הפרויקט' : 'הלקוח')}</p>
        {!compact && (person.phone || person.email) && (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-caption">
            {person.phone && (
              <a href={`tel:${person.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline">
                <Phone aria-hidden="true" className="size-3.5" />
                {person.phone}
              </a>
            )}
            {person.email && (
              <a href={`mailto:${person.email}`} dir="ltr" className="inline-flex min-w-0 items-center gap-1 truncate text-ink-700 hover:underline">
                <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{person.email}</span>
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const ISRAEL_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** An ISO timestamp as Israel's calendar date and clock (numbers only, so SSR and the browser agree). */
export function israelDateTime(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(ISRAEL_PARTS.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "12 באוקטובר, 09:30". */
export function dateTimeLabel(iso: string, today: string): string {
  const { date, time } = israelDateTime(iso);
  return `${dateLabel(date, today)}, ${time}`;
}

/** "20 באוקטובר" (with the year when it isn't the current one). */
export function dateLabel(date: string, today: string): string {
  const base = dayMonthLabel(date);
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${date.slice(0, 4)}`;
}

/** "היום", "מחר", "בעוד 12 ימים", "לפני 3 ימים" (relative to `today`). */
export function relativeDayLabel(days: number): string {
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === -1) return 'אתמול';
  if (days === 2) return 'בעוד יומיים';
  if (days === -2) return 'לפני יומיים';
  return days > 0 ? `בעוד ${days} ימים` : `לפני ${-days} ימים`;
}

/** "באיחור של יום", "באיחור של 3 ימים". */
export function lateLabel(days: number): string {
  if (days === 1) return 'באיחור של יום';
  if (days === 2) return 'באיחור של יומיים';
  return `באיחור של ${days} ימים`;
}
