import { Play, Sparkles } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Avatar } from '@/components/ui/Avatar';
import { RatingStars } from '@/components/ui/RatingStars';
import { HOW_IT_WORKS, HERO_MOMENT } from '@/lib/home/content';
import { EXAMPLE_QUESTIONS } from '@/lib/home/questions';
import { formatDuration } from '@/lib/format';
import type { HomePro } from '@/lib/home/data';

/* Small, decorative UI previews: they show the flow, they are not controls. */

function AskPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5" aria-hidden="true">
      <div className="max-w-[88%] self-end rounded-2xl rounded-ee-md bg-ink-900 px-3.5 py-2 text-sm font-medium text-white">
        {EXAMPLE_QUESTIONS[0]?.text}
      </div>
      <div className="max-w-[92%] self-start rounded-2xl rounded-es-md bg-primary-50 px-3.5 py-3 ring-1 ring-primary-100">
        <span className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
          <Sparkles className="size-3.5" />
          תשובה מהשטח
        </span>
        <span className="mt-2 block h-2 w-full rounded-full bg-primary-200/80" />
        <span className="mt-1.5 block h-2 w-11/12 rounded-full bg-primary-200/80" />
        <span className="mt-1.5 block h-2 w-3/5 rounded-full bg-primary-200/80" />
        <span className="mt-2.5 block text-[0.6875rem] text-ink-500">מחירים נכונים ל-2026</span>
      </div>
    </div>
  );
}

function MomentPreview({ percent }: { percent: number }) {
  return (
    <div className="relative h-full overflow-hidden rounded-xl bg-ink-900" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative YouTube thumbnail */}
      <img
        src={`https://i.ytimg.com/vi/${HERO_MOMENT.youtubeId}/mqdefault.jpg`}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover opacity-80"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <span className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-900 shadow-xs">
        <Play className="size-3 fill-primary-600 text-primary-600" />
        קפיצה ל-<span className="num">{formatDuration(HERO_MOMENT.startSeconds)}</span>
      </span>
      {/* Video timelines stay left-to-right, like the player itself */}
      <div dir="ltr" className="absolute inset-x-3 bottom-3">
        <div className="relative h-1.5 rounded-full bg-white/30">
          <span className="absolute inset-y-0 left-0 rounded-full bg-primary-500" style={{ width: `${percent}%` }} />
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-primary-500"
            style={{ left: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MatchPreview({ pro }: { pro?: HomePro }) {
  return (
    <div className="flex h-full flex-col justify-center gap-3" aria-hidden="true">
      <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-xs ring-1 ring-ink-100">
        <Avatar name={pro?.name ?? 'בעל מקצוע'} src={pro?.photo} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink-900">{pro?.name ?? 'בעל מקצוע מהנבחרת'}</p>
          <p className="truncate text-xs text-ink-500">{pro?.specialty ?? 'נבחרת המומלצים'}</p>
          <RatingStars value={pro?.ratingAvg ?? 10} scale={10} size="sm" className="mt-1" />
        </div>
      </div>
      <div className="flex gap-2">
        <span className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary-600 text-xs font-bold text-white">פגישת ייעוץ</span>
        <span className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-ink-200 bg-white text-xs font-bold text-ink-800">
          לעמוד העסקי
        </span>
      </div>
    </div>
  );
}

/** "איך זה עובד": ask, watch the exact moment, move on with a pro or a consultation. */
export default function HowItWorks({ pro, momentPercent = 22 }: { pro?: HomePro; momentPercent?: number }) {
  const previews = [<AskPreview key="a" />, <MomentPreview key="m" percent={momentPercent} />, <MatchPreview key="p" pro={pro} />];
  return (
    <Section tone="white" labelledBy="how-title">
      <SectionHeader
        id="how-title"
        eyebrow="איך זה עובד"
        title="שאלה אחת, תשובה מהשטח"
        highlight="מהשטח"
        description="שלושה צעדים, בלי לחפש בשעות של סרטונים."
        align="center"
      />
      <ol className="relative grid gap-5 lg:grid-cols-3 lg:gap-6">
        <span aria-hidden="true" className="absolute inset-x-[16%] top-24 hidden border-t-2 border-dashed border-ink-200 lg:block" />
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="relative rounded-3xl border border-ink-100 bg-paper p-5 sm:p-6">
            <div className="h-44 rounded-2xl bg-white p-4 ring-1 ring-ink-100">{previews[i]}</div>
            <div className="mt-6 flex items-center gap-3">
              <span className="num inline-flex h-8 items-center rounded-full bg-primary-600 px-3 text-sm font-bold text-white">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-title-lg text-ink-900">{step.title}</h3>
            </div>
            <p className="mt-3 text-body text-ink-600">{step.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
