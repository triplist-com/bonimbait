import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Calculator,
  CalendarCheck,
  ExternalLink,
  Mail,
  MessageCircleQuestion,
  Phone,
  Route,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { agoHe } from '@/lib/demo/format';
import { formatMonthHe, regionName, stageLabel } from '@/lib/project-file/format';
import { SCORE_WEIGHTS } from '@/lib/project-file/score';
import { CONSULT_STAGES } from '@/lib/revenue/consult-workflow';
import type { ConsultLeadView } from '@/lib/revenue/consult-view';
import { classifyQuestion, getTopic } from '@/lib/revenue/topics';
import { NisRange, Sqm } from './Amounts';
import ScoreBadge from './ScoreBadge';

/** 050-1234567 -> 972501234567 (wa.me). */
export function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (/^0\d{8,9}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^972\d{8,9}$/.test(digits)) return digits;
  return null;
}

function minutesSince(iso: string, now: Date): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((now.getTime() - t) / 60_000)) : 0;
}

function Block({ title, icon, children, className }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-ink-100 pt-5', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-title-sm text-ink-900">
        <span aria-hidden="true" className="text-ink-500 [&_svg]:size-[1.125rem]">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Bars are scaled to the biggest single reason (a full stage or budget step). */
const MAX_REASON_POINTS = Math.max(SCORE_WEIGHTS.budget, SCORE_WEIGHTS.stage);

/**
 * The project-file panel of the consult queue: who is calling, where they
 * stand, what they asked and why they scored what they scored, before
 * anyone picks up the phone. Server-safe; `actions` is the interactive slot.
 */
export default function ProjectFilePanel({
  lead,
  now,
  actions,
  fullRecordHref,
  compact = false,
}: {
  lead: ConsultLeadView;
  /** ISO time the view was built (relative dates). */
  now: string;
  actions?: ReactNode;
  fullRecordHref?: string | null;
  /** Inside a page that already shows the lead's name and contact details (the lead page). */
  compact?: boolean;
}) {
  const nowDate = new Date(now);
  const file = lead.file;
  const wa = whatsappNumber(lead.phone);
  const firstName = lead.name.split(' ')[0];
  const stage = CONSULT_STAGES[lead.stage];
  const facts: Array<{ key: string; label: string; value: ReactNode | null }> = [
    { key: 'stage', label: 'שלב', value: stageLabel(file.stage) },
    { key: 'region', label: 'אזור', value: regionName(file.regionSlug) },
    { key: 'size', label: 'גודל', value: file.sizeM2 ? <Sqm value={file.sizeM2} /> : null },
    { key: 'budget', label: 'תקציב', value: file.budgetRangeNis ? <NisRange range={file.budgetRangeNis} /> : null },
    { key: 'move', label: 'כניסה מתוכננת', value: formatMonthHe(file.targetMoveIn) },
  ];
  const questions = [...(file.questions ?? [])].reverse();

  return (
    <article
      aria-labelledby={compact ? undefined : `lead-${lead.id}`}
      aria-label={compact ? 'תיק הפרויקט' : undefined}
      className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6"
    >
      {compact ? (
        <div className="mb-5 flex items-center gap-4">
          <ScoreBadge score={lead.score?.score ?? null} band={lead.score?.band ?? null} size="md" showBand />
          <div>
            <h2 className="text-title-lg text-ink-900">תיק הפרויקט</h2>
            <p className="text-sm text-ink-600">הציון והתיק שהגיעו עם הפנייה</p>
          </div>
        </div>
      ) : (
        <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stage.tone} dot>
              {stage.label}
            </Badge>
            {lead.bookedAt && (
              <Badge tone="info" icon={<CalendarCheck />}>
                {lead.bookingMethod === 'phone' ? 'נקבעה בטלפון' : 'נקבעה ב-Calendly'}
              </Badge>
            )}
          </div>
          <h2 id={`lead-${lead.id}`} className="mt-2 text-headline-sm text-ink-900">
            {lead.name}
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            <span dir="ltr" className="font-mono">
              {lead.ref}
            </span>{' '}
            · התקבל {agoHe(lead.minutesAgo)}
          </p>
        </div>
        <ScoreBadge score={lead.score?.score ?? null} band={lead.score?.band ?? null} size="lg" showBand />
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {lead.phone && (
          <a
            href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
          >
            <Phone aria-hidden="true" className="size-4" />
            <span dir="ltr">{lead.phone}</span>
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(`היי ${firstName}, כאן מצוות בונים בית לגבי פגישת הייעוץ שלכם`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-whatsapp px-4 text-sm font-semibold text-ink-950 hover:brightness-95"
          >
            WhatsApp
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 px-4 text-sm font-semibold text-ink-800 hover:border-ink-300"
          >
            <Mail aria-hidden="true" className="size-4" />
            <span dir="ltr">{lead.email}</span>
          </a>
        )}
      </div>
        </>
      )}

      {actions && <div className="mt-4">{actions}</div>}

      <div className="mt-5 space-y-5">
        <Block title={lead.score ? `למה הציון ${lead.score.score}` : 'ציון'} icon={<Sparkles />} className="border-t-0 pt-0">
          {lead.score && lead.score.reasons.length > 0 ? (
            <ul className="space-y-2.5">
              {lead.score.reasons.map((r) => (
                <li key={`${r.code}-${r.label}`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-800">{r.label}</span>
                    <span className="num shrink-0 font-bold text-ink-900">+{r.points}</span>
                  </div>
                  <span aria-hidden="true" className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="block h-full rounded-full bg-primary-600"
                      style={{ width: `${Math.min(100, (r.points / MAX_REASON_POINTS) * 100)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">אין עדיין מספיק פרטים בתיק כדי לדרג את הפנייה.</p>
          )}
          {lead.score && lead.score.missing.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-ink-600">
              חסר בתיק:
              {lead.score.missing.map((m) => (
                <Badge key={m} tone="outline" size="sm">
                  {m}
                </Badge>
              ))}
            </p>
          )}
        </Block>

        <Block title="הפרויקט" icon={<Route />}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.key}>
                <dt className="text-caption text-ink-500">{f.label}</dt>
                <dd className={cn('text-body-sm font-semibold', f.value ? 'text-ink-900' : 'text-ink-400')}>{f.value ?? 'לא ידוע'}</dd>
              </div>
            ))}
          </dl>
        </Block>

        <Block title={questions.length ? `מה הם שאלו (${questions.length})` : 'מה הם שאלו'} icon={<MessageCircleQuestion />}>
          {questions.length === 0 ? (
            <p className="text-sm text-ink-600">לא נשאלו שאלות באתר לפני הפנייה.</p>
          ) : (
            <ol className="space-y-2.5">
              {questions.map((q) => {
                const topics = classifyQuestion(q.q).topics.slice(0, 2);
                return (
                  <li key={`${q.at}-${q.q}`} className="rounded-2xl bg-sand-50 px-3.5 py-2.5 ring-1 ring-inset ring-sand-200">
                    <p className="text-body-sm text-ink-900">{q.q}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-500">
                      {agoHe(minutesSince(q.at, nowDate))}
                      {topics.map((t) => (
                        <Badge key={t} tone="sand" size="sm">
                          {getTopic(t)?.label}
                        </Badge>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </Block>

        {file.plannerEstimate && (
          <Block title="מחשבון התקציב" icon={<Calculator />}>
            <p className="text-body-sm text-ink-800">
              הערכה של <strong className="font-bold text-ink-900"><NisRange range={[file.plannerEstimate.totalMin, file.plannerEstimate.totalMax]} /></strong>{' '}
              <span className="text-ink-500">· {agoHe(minutesSince(file.plannerEstimate.at, nowDate))}</span>
            </p>
          </Block>
        )}

        {lead.shortlist.length > 0 && (
          <Block title="הרשימה הקצרה שלהם" icon={<Users />}>
            <ul className="flex flex-wrap gap-2">
              {lead.shortlist.map((b) => (
                <li key={b.id}>
                  {b.href ? (
                    <Link href={b.href} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-3 py-1 text-sm text-ink-800 hover:bg-ink-200">
                      {b.name}
                    </Link>
                  ) : (
                    <span className="inline-flex rounded-full bg-ink-100 px-3 py-1 text-sm text-ink-800">{b.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block title="מקור ושיוך" icon={<ExternalLink />}>
          <dl className="space-y-1.5 text-sm">
            {[
              ['איך הגיעו', lead.source.attribution],
              ['עמוד הנחיתה', file.source?.landing ? <span dir="ltr">{file.source.landing}</span> : null],
              ['קמפיין', file.source?.utm ? Object.entries(file.source.utm).map(([k, v]) => `${k.replace('utm_', '')}: ${v}`).join(' · ') : null],
              ['הכפתור שנלחץ', lead.source.cta],
              ['נשלח מהעמוד', lead.source.page ? <span dir="ltr">{lead.source.page}</span> : null],
              ['ניתוב', lead.source.routing],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={String(k)} className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="min-w-0 break-words text-ink-800">{v}</dd>
                </div>
              ))}
          </dl>
          {fullRecordHref && (
            <Link href={fullRecordHref} className="mt-3 inline-block text-sm font-semibold text-primary-700 hover:underline">
              לכרטיס הליד המלא והערות
            </Link>
          )}
        </Block>
      </div>
    </article>
  );
}
