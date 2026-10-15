import type { Metadata } from 'next';
import { ArrowLeft, ExternalLink, Laptop, Lock, MonitorPlay, Smartphone } from 'lucide-react';
import TourNotes from '@/components/pitch/TourNotes';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { DEMO_VIEWS } from '@/lib/demo/views';
import { isEnabled } from '@/lib/flags';
import { getPitchData } from '@/lib/pitch/data';
import { AUTOPILOT_MEASURED, secondsLabel } from '@/lib/pitch/facts';
import { PILLARS } from '@/lib/pitch/pillars';
import { BASE_CASE, computeRoi, formatCount, formatNisRounded } from '@/lib/pitch/roi';
import { ltr } from '@/lib/pitch/text';
import {
  TOUR_MINUTES,
  formatMinutes,
  resolveTour,
  type MeasuredFigureKey,
  type ResolvedBeat,
  type ResolvedTarget,
  type TourFigure,
} from '@/lib/pitch/tour';
import { absoluteUrl } from '@/lib/site';

export const revalidate = 3600;

const TITLE = 'הסיור: בונים בית OS ב-15 דקות';
const DESCRIPTION = 'עשר תחנות, מהשאלה הראשונה ועד המפתח: היועץ, התקציב הראשוני, תיק הפרויקט, חדר הבקרה, דוח השותף והמעבר בלי סיכון.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/platform/tour/'),
    siteName: 'בונים בית',
    locale: 'he_IL',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const PILLAR_NAMES = Object.fromEntries(PILLARS.map((p) => [p.id, p.name]));

const SOURCE_BADGE: Record<TourFigure['source'], { label: string; tone: 'brand' | 'sand' | 'info' }> = {
  owner: { label: 'המספרים שלכם', tone: 'brand' },
  demo: { label: 'נתוני הדגמה', tone: 'sand' },
  measured: { label: 'מחושב מהנתונים', tone: 'info' },
};

function TargetButton({ target, primary }: { target: ResolvedTarget; primary?: boolean }) {
  const icon =
    target.kind === 'demo' ? <MonitorPlay aria-hidden="true" /> : target.staffOnly ? <Lock aria-hidden="true" /> : undefined;
  return (
    <ButtonLink
      href={target.href}
      size={primary ? 'lg' : 'md'}
      variant={primary ? 'primary' : 'outline'}
      prefetch={false}
      iconStart={icon}
      iconEnd={primary && target.kind === 'pitch' ? <ArrowLeft aria-hidden="true" className="ltr:rotate-180" /> : undefined}
      title={target.staffOnly ? 'דורש כניסה כמנהל' : undefined}
      className={primary ? 'w-full sm:w-auto' : undefined}
    >
      {target.label}
    </ButtonLink>
  );
}

function Beat({ beat, index, figureValue }: { beat: ResolvedBeat; index: number; figureValue: string | null }) {
  const DeviceIcon = beat.device === 'phone' ? Smartphone : Laptop;
  const titleId = `beat-${beat.id}-title`;
  return (
    <li id={`beat-${beat.id}`} className="scroll-mt-40 md:scroll-mt-32">
      <article aria-labelledby={titleId} className="grid gap-5 rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7 lg:grid-cols-12 lg:gap-8">
        <header className="lg:col-span-4">
          <p className="flex items-center gap-2 text-sm font-bold text-primary-700">
            <span className="num inline-flex size-7 items-center justify-center rounded-full bg-primary-50 text-xs">{index + 1}</span>
            <span className="num">
              {formatMinutes(beat.from)}–{formatMinutes(beat.to)}
            </span>
          </p>
          <h2 id={titleId} className="mt-3 text-headline-sm text-ink-900">
            {beat.title}
          </h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
            <DeviceIcon aria-hidden="true" className="size-4 text-ink-500" />
            <span>
              {beat.device === 'phone' ? 'בנייד' : 'במחשב'} · {beat.screen}
            </span>
          </p>
          {beat.pillars.length > 0 && (
            <p className="mt-3 flex flex-wrap gap-1.5">
              {beat.pillars.map((id) => (
                <Badge key={id} tone="outline" size="sm">
                  {PILLAR_NAMES[id]}
                </Badge>
              ))}
            </p>
          )}
          <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {beat.primary ? (
              <TargetButton target={beat.primary} primary />
            ) : (
              <Badge tone="sand" dot>
                המסך בקרוב
              </Badge>
            )}
            {beat.secondary.map((t) => (
              <TargetButton key={t.href} target={t} />
            ))}
          </div>
        </header>

        <div className="lg:col-span-8">
          <h3 className="sr-only">מה אומרים</h3>
          <ul className="space-y-2.5">
            {beat.lines.map((line) => (
              <li key={line} className="flex gap-3 text-body text-ink-800">
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {beat.figure && (figureValue || beat.figure.source !== 'measured') && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-paper px-4 py-3.5 ring-1 ring-inset ring-ink-100">
              <p className="text-lg font-extrabold text-ink-900">
                {beat.figure.source === 'measured' ? figureValue : beat.figure.value}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
                <Badge tone={SOURCE_BADGE[beat.figure.source].tone} size="sm">
                  {SOURCE_BADGE[beat.figure.source].label}
                </Badge>
                {beat.figure.label}
              </p>
            </div>
          )}

          <aside
            aria-label="הערות למציג"
            className="mt-5 hidden rounded-2xl border border-dashed border-ink-200 bg-sand-50 p-4 group-data-[notes=on]/tour:block"
          >
            <p className="text-xs font-bold text-sand-800">הערות למציג</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-700">
              {beat.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </aside>
        </div>
      </article>
    </li>
  );
}

/** The guided 15-minute demo, beat by beat (lib/pitch/tour.ts). */
export default async function TourPage() {
  const data = await getPitchData();
  const beats = resolveTour(DEMO_VIEWS, (flag) => isEnabled(flag));
  const { parity, channel } = data.facts;
  const roi = computeRoi(BASE_CASE, data.prices);
  const n = (v: number) => v.toLocaleString('he-IL');

  const figures: Record<MeasuredFigureKey, string> = {
    library: `${n(channel.total)} סרטונים · ${n(channel.podcastLatestEpisode)} פרקים · ${n(data.articles)} מאמרים · ${n(data.pros)} בעלי מקצוע`,
    switch: `${ltr(`${n(parity.passed)}/${n(parity.total)}`)} כתובות · טעינה בנייד: ${secondsLabel(data.speed.old.lcpMs.simulate)} מול ${secondsLabel(data.speed.new.lcpMs.simulate)} שנ׳`,
    roi: `${formatCount(roi.consultsPerYear)} פגישות ייעוץ נוספות · ${formatNisRounded(roi.totalRevenue)} בשנה`,
    autopilot: `כ-${ltr(`$${AUTOPILOT_MEASURED.costPerVideoUsd}`)} לסרטון · כ-${AUTOPILOT_MEASURED.processSeconds} שניות עיבוד`,
  };

  return (
    <>
      <section aria-labelledby="tour-title" className="relative isolate overflow-hidden bg-ink-950 text-white">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="bg-blueprint-dark mask-fade-b absolute inset-0" />
          <div className="absolute -top-40 end-[-10%] size-[36rem] rounded-full bg-primary-600/25 blur-3xl" />
        </div>
        <div className="container-page py-12 sm:py-16">
          <p className="text-sm font-bold text-primary-300">
            הסיור · בונים בית <span dir="ltr">OS</span>
          </p>
          <h1 id="tour-title" className="mt-3 max-w-3xl text-display text-white">
            <span className="num">{TOUR_MINUTES}</span> דקות, מהשאלה הראשונה <span className="text-primary-400">ועד המפתח</span>
          </h1>
          <p className="mt-4 max-w-2xl text-body-lg text-white/75">
            עשר תחנות, לפי הסדר. מסכי הבונים בנייד, חדר הבקרה והשותפים במחשב. מסכי ההדגמה רצים על נתונים לדוגמה ומסומנים ככאלה; כל השאר
            הוא התוכן שלכם.
          </p>

          {/* The 15 minutes at a glance: segment width = beat length; colour = device (with a legend) */}
          <nav aria-label="תחנות הסיור" className="mt-9">
            <ol className="flex h-12 gap-0.5 overflow-hidden rounded-xl">
              {beats.map((beat, i) => (
                <li key={beat.id} style={{ flexGrow: beat.to - beat.from, flexBasis: 0 }} className="min-w-0">
                  <a
                    href={`#beat-${beat.id}`}
                    title={`${i + 1}. ${beat.title}`}
                    className={cn(
                      'flex h-full items-center justify-center text-xs font-bold transition-opacity hover:opacity-80',
                      beat.device === 'phone' ? 'bg-primary-600 text-white' : 'bg-white/85 text-ink-900',
                    )}
                  >
                    <span className="num">{i + 1}</span>
                    <span className="sr-only">. {beat.title}</span>
                  </a>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
              <p className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary-600" />
                  <Smartphone aria-hidden="true" className="size-3.5" /> נייד
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-sm bg-white/85" />
                  <Laptop aria-hidden="true" className="size-3.5" /> מחשב
                </span>
              </p>
              <p>
                <span className="num">0:00</span> עד <span className="num">{formatMinutes(TOUR_MINUTES)}</span>
              </p>
            </div>
          </nav>
        </div>
      </section>

      <TourNotes
        toolbar={
          <ButtonLink href="/platform/" size="sm" variant="ghost" className="rounded-full" iconStart={<ExternalLink aria-hidden="true" />}>
            הסקירה
          </ButtonLink>
        }
      >
        <ol className="container-page space-y-4 pb-16 pt-2 sm:space-y-5">
          {beats.map((beat, i) => (
            <Beat key={beat.id} beat={beat} index={i} figureValue={beat.figure?.source === 'measured' ? figures[beat.figure.key] : null} />
          ))}
        </ol>
      </TourNotes>
    </>
  );
}
