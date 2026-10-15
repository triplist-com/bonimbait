import { CalendarCheck, Captions, Handshake, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SocialIcon } from '@/components/ui/SocialIcon';
import { COMMUNITY_STATS } from '@/lib/brand';
import {
  LANGUAGE_ACTION,
  PARTNER_TIERS,
  PRICE_SOURCES,
  transcribedShare,
  type ChannelFacts,
  type LibraryStats,
  type PlanPoint,
} from '@/lib/pitch/facts';
import { formatNis } from '@/lib/pitch/roi';

interface BusinessScreenProps {
  channel: ChannelFacts;
  library: LibraryStats;
  articles: number;
  pros: number;
  reviews: number;
  plans: PlanPoint[];
}

const n = (value: number) => value.toLocaleString('he-IL');

function PlanPrice({ plan }: { plan: PlanPoint }) {
  if (plan.minNis === plan.maxNis) return <>{formatNis(plan.minNis)}</>;
  return (
    <>
      <span className="num">
        {n(plan.minNis / 1_000)}–{n(plan.maxNis / 1_000)}
      </span>{' '}
      אלף ₪
    </>
  );
}

/** The ladder from the free consult to turnkey: stylised steps, not a chart (prices are the labels). */
function Ladder({ plans }: { plans: PlanPoint[] }) {
  const steps = [
    { key: 'consult', name: 'פגישת ייעוץ תקציב', price: <>ללא עלות</> },
    ...plans.map((p) => ({ key: p.slug, name: p.name, price: <PlanPrice plan={p} /> })),
  ];
  const heights = ['h-24', 'h-32', 'h-40', 'h-52', 'h-60'];
  // Phones: the same stairs laid on their side, each step a little longer.
  const widths = ['w-[58%]', 'w-[68%]', 'w-[78%]', 'w-[89%]', 'w-full'];
  const tones = [
    'bg-sand-100 text-ink-900',
    'bg-primary-100 text-ink-900',
    'bg-primary-300 text-ink-900',
    'bg-primary-600 text-white',
    'bg-primary-800 text-white',
  ];
  return (
    <>
      <ol className="space-y-2 sm:hidden">
        {steps.map((step, i) => (
          <li
            key={step.key}
            className={`flex items-center justify-between gap-2 rounded-e-2xl rounded-s-md px-3 py-2.5 ${widths[i] ?? 'w-full'} ${tones[i] ?? tones[tones.length - 1]}`}
          >
            <span className="text-sm font-bold leading-tight">{step.name}</span>
            <span className="shrink-0 text-xs font-semibold">{step.price}</span>
          </li>
        ))}
      </ol>
      <ol className="hidden items-end gap-3 sm:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, i) => (
          <li
            key={step.key}
            className={`flex flex-col justify-start rounded-t-2xl rounded-b-md p-3 ${heights[i] ?? 'h-60'} ${tones[i] ?? tones[tones.length - 1]}`}
          >
            <span className="text-sm font-bold leading-tight">{step.name}</span>
            <span className="mt-1 text-[0.8125rem] font-semibold opacity-90">{step.price}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Section 2: his business as one system, every number computed or quoted from his public pages. */
export default function BusinessScreen({ channel, library, articles, pros, reviews, plans }: BusinessScreenProps) {
  const share = transcribedShare(library);

  return (
    <Section tone="paper" id="business" labelledBy="business-title" className="scroll-mt-8 md:scroll-mt-0">
      <SectionHeader
        id="business-title"
        eyebrow="העסק שלכם במסך אחד"
        title="חברת ניהול עם מנוע תוכן"
        highlight="מנוע תוכן"
        description="לא בלוג עם מרקטפלייס. התוכן והקהילה מביאים בונים לפגישת ייעוץ, משם לתוכניות הניהול, והשותפים לאורך כל הדרך. כל מספר כאן מחושב מהנתונים או לקוח מהעמודים הציבוריים שלכם."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
        {/* Content engine */}
        <Card as="article" padding="lg" aria-labelledby="engine-title">
          <h3 id="engine-title" className="text-title-lg text-ink-900">
            מנוע התוכן
          </h3>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {[
              { value: n(channel.total), label: 'סרטונים בערוץ', hint: `${n(channel.playlists)} פלייליסטים` },
              { value: n(channel.hours), label: 'שעות של תוכן', hint: 'וידאו ופודקאסט' },
              { value: n(channel.podcastLatestEpisode), label: 'פרקי פודקאסט', hint: 'עד הפרק האחרון' },
              { value: n(articles), label: 'מאמרים', hint: 'מפורסמים באתר' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col">
                <dt className="order-2 text-sm font-medium text-ink-600">{s.label}</dt>
                <dd className="order-1 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                  <span className="num">{s.value}</span>
                </dd>
                <dd className="order-3 text-xs text-ink-500">{s.hint}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 rounded-2xl border border-ink-100 bg-paper p-4 sm:p-5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-bold text-ink-900">כבר עונים לבונים, עד השנייה המדויקת</span>
              <span className="text-sm text-ink-600">
                <span className="num font-bold text-ink-900">{n(library.transcribed)}</span> מתוך{' '}
                <span className="num">{n(library.catalog)}</span> סרטונים בקטלוג
              </span>
            </p>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-primary-100"
              role="img"
              aria-label={`${share}% מהקטלוג עם תמלול מלא`}
            >
              <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.max(2, share)}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-500">
              <span className="num">{n(library.transcribedHours)}</span> שעות עם תמלול מלא. עוד{' '}
              <span className="num">{n(library.titleOnly)}</span> סרטונים מוכרים ליועץ לפי הכותרת והפרקים, וקופצים לתשובה מלאה כשיש
              להם כתוביות.
            </p>
          </div>

          <div className="mt-4 flex gap-3 rounded-2xl bg-sand-50 p-4 ring-1 ring-inset ring-sand-200 sm:p-5">
            <Captions aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-700" />
            <div className="text-sm leading-6 text-ink-700">
              <p className="font-bold text-ink-900">{LANGUAGE_ACTION.title}</p>
              <p className="mt-1">
                {LANGUAGE_ACTION.how} {LANGUAGE_ACTION.why} {LANGUAGE_ACTION.outcome}
              </p>
              <p className="mt-1 text-xs text-sand-800">{LANGUAGE_ACTION.confidence}</p>
            </div>
          </div>
        </Card>

        {/* The ladder */}
        <Card as="article" padding="lg" aria-labelledby="ladder-title">
          <h3 id="ladder-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <CalendarCheck aria-hidden="true" className="size-5 text-primary-600" />
            מפגישת ייעוץ ועד ליווי עד מפתח
          </h3>
          <p className="mt-1 text-sm text-ink-600">כאן נמצא הכסף. כל חלק בפלטפורמה מוביל לשלב הבא בסולם.</p>
          <div className="mt-6">
            <Ladder plans={plans} />
          </div>
          <p className="mt-3 text-caption text-ink-500">
            לפני מע״מ, כפי שמופיע ב-<span dir="ltr">{PRICE_SOURCES.plans}</span> (אוקטובר 2026).
          </p>
        </Card>
        </div>

        <div className="space-y-4 lg:col-span-5">
        {/* Community */}
        <Card as="article" padding="lg" aria-labelledby="community-title">
          <h3 id="community-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <Users aria-hidden="true" className="size-5 text-primary-600" />
            הקהילה
          </h3>
          <ul className="mt-5 grid grid-cols-2 gap-3">
            {COMMUNITY_STATS.map((s) => (
              <li key={s.id} className="rounded-2xl border border-ink-100 bg-paper p-4">
                <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                  <SocialIcon id={s.id} className="size-[1.125rem]" />
                </span>
                <p className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900">
                  <span className="num">{s.value}</span>
                </p>
                <p className="text-sm text-ink-600">
                  {s.label} ב-<span dir="ltr">{s.network}</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-caption text-ink-500">כפי שהם מתפרסמים באתר שלכם.</p>
        </Card>

        {/* Partners and pros */}
        <Card as="article" padding="lg" aria-labelledby="partners-title">
          <h3 id="partners-title" className="flex items-center gap-2 text-title-lg text-ink-900">
            <Handshake aria-hidden="true" className="size-5 text-primary-600" />
            שותפים ונבחרת המומלצים
          </h3>
          <ul className="mt-5 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-paper">
            {PARTNER_TIERS.map((tier) => (
              <li key={tier.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="font-bold text-ink-900">{tier.name}</span>
                <span className="text-sm text-ink-600">
                  <span className="font-bold text-ink-900">{formatNis(tier.monthlyNis)}</span> לחודש
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-ink-500">
            מסלולי השותפים מ-<span dir="ltr">{PRICE_SOURCES.partners}</span>.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <dt className="order-2 text-sm text-ink-600">בעלי מקצוע מומלצים</dt>
              <dd className="order-1 text-3xl font-extrabold tracking-tight text-ink-900">
                <span className="num">{n(pros)}</span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="order-2 text-sm text-ink-600">ביקורות של בונים</dt>
              <dd className="order-1 text-3xl font-extrabold tracking-tight text-ink-900">
                <span className="num">{n(reviews)}</span>
              </dd>
            </div>
          </dl>
        </Card>
        </div>
      </div>
    </Section>
  );
}
