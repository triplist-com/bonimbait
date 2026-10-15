import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, FolderOpen, Play, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { CHANNEL_TRAILER } from '@/lib/brand';
import { formatDuration } from '@/lib/format';
import { HERO_MOMENT } from '@/lib/home/content';
import { mediaUrl } from '@/lib/media';
import {
  hebrewShortDate,
  libraryPhrase,
  secondsLabel,
  speedup,
  type LibraryStats,
  type ParityFacts,
  type SpeedFile,
} from '@/lib/pitch/facts';
import { OWNER_QUOTE } from '@/lib/pitch/tour';

interface PitchHeroProps {
  channelTotal: number;
  library: LibraryStats;
  parity: ParityFacts;
  speed: SpeedFile;
}

/** Section 1: his own words, the headline, and three measured proof points. */
export default function PitchHero({ channelTotal, library, parity, speed }: PitchHeroProps) {
  const oldLcp = speed.old.lcpMs.simulate;
  const newLcp = speed.new.lcpMs.simulate;
  const momentHref = `/video/${HERO_MOMENT.youtubeId}/?t=${HERO_MOMENT.startSeconds}`;

  return (
    <section id="top" aria-labelledby="pitch-title" className="relative isolate scroll-mt-8 overflow-hidden bg-ink-950 text-white md:scroll-mt-0">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="bg-blueprint-dark mask-fade-b absolute inset-0" />
        <div className="absolute -top-48 end-[-12%] size-[44rem] rounded-full bg-primary-600/25 blur-3xl" />
        <div className="absolute -bottom-56 start-[-10%] size-[34rem] rounded-full bg-primary-900/60 blur-3xl" />
      </div>

      <div className="container-page grid gap-12 pb-14 pt-10 sm:pt-14 lg:grid-cols-12 lg:items-center lg:gap-14 lg:pb-20 lg:pt-16">
        <div className="lg:col-span-7">
          {/* 1. His own words */}
          <figure className="max-w-xl">
            <blockquote className="relative ps-6 text-lg leading-8 text-white/85 [text-wrap:balance] sm:text-xl sm:leading-9">
              <span aria-hidden="true" className="absolute -top-1 start-0 text-4xl font-black leading-none text-primary-400">
                ״
              </span>
              {OWNER_QUOTE.text}.
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3 ps-6 text-sm">
              <Image
                src={mediaUrl('uploads/mp-v6/team/tomer-white.webp')}
                alt=""
                width={80}
                height={80}
                sizes="40px"
                className="size-10 rounded-full bg-white object-cover object-top ring-2 ring-white/20"
              />
              <span className="leading-5">
                <span className="block font-bold text-white">{OWNER_QUOTE.author}</span>
                <span className="text-white/60">{OWNER_QUOTE.role}</span>
              </span>
            </figcaption>
          </figure>

          <p className="mt-10 text-sm font-bold text-primary-300 sm:text-base">בנינו את המקום הזה. עם התוכן שלכם. הוא כבר רץ.</p>
          <h1 id="pitch-title" className="mt-3 text-display-xl text-white">
            <span className="sm:whitespace-nowrap">כל שאלה של בונה{'\u00A0'}—</span>{' '}
            <span className="whitespace-nowrap text-primary-400">לקוח שלכם.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-body-lg text-white/75 sm:text-[1.3125rem] sm:leading-[1.7]">
            הפלטפורמה שהופכת את {libraryPhrase(channelTotal)} הסרטונים שלכם ליועץ שכל בונה שואל, ואת כל בונה ששואל — לתיק פרויקט אצלכם.
          </p>

          <p className="mt-7 inline-flex flex-wrap items-center gap-x-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm text-white/80 backdrop-blur">
            <span className="font-extrabold text-white">
              בונים בית <span dir="ltr">OS</span>
            </span>
            <span aria-hidden="true" className="text-primary-400">
              —
            </span>
            <span>מהשאלה הראשונה ועד המפתח</span>
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/platform/tour/" size="lg" iconEnd={<ArrowLeft aria-hidden="true" className="ltr:rotate-180" />}>
              התחילו בסיור של 15 דקות
            </ButtonLink>
            <ButtonLink href="#roi" size="lg" variant="inverse">
              המספרים שלכם
            </ButtonLink>
          </div>
        </div>

        {/* Visual: the owner on his own trailer, a real answer moment, a sample project file */}
        <div className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] border border-white/10 bg-ink-900 shadow-dialog">
            <Image
              src={CHANNEL_TRAILER.poster}
              alt="תומר חן ריחאנה בתוכניות של בית בבנייה"
              fill
              priority
              sizes="(min-width: 1024px) 34rem, 92vw"
              className="object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
          </div>

          <Link
            href={momentHref}
            prefetch={false}
            className="group relative z-10 mx-auto -mt-8 flex w-[min(100%-1.5rem,22rem)] items-center gap-3 rounded-2xl bg-white p-3 text-ink-900 shadow-lift ring-1 ring-ink-900/5 transition-transform hover:-translate-y-0.5 lg:absolute lg:-bottom-10 lg:start-[-2.5rem] lg:mx-0 lg:mt-0"
          >
            <span className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-900">
              {/* eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail */}
              <img
                src={`https://i.ytimg.com/vi/${HERO_MOMENT.youtubeId}/mqdefault.jpg`}
                alt=""
                width={96}
                height={56}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/25">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-white text-primary-600">
                  <Play className="size-3.5 translate-x-[-1px] fill-current" />
                </span>
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-xs font-bold text-primary-700">
                <Sparkles aria-hidden="true" className="size-3.5" />
                תשובה מהשטח
              </span>
              <span className="mt-0.5 block truncate text-sm font-bold">{HERO_MOMENT.question}</span>
              <span className="mt-0.5 block text-xs text-ink-500">
                הרגע המדויק בסרטון: <span className="num font-semibold text-ink-800">{formatDuration(HERO_MOMENT.startSeconds)}</span>
              </span>
            </span>
          </Link>

          <div className="absolute -top-5 end-3 hidden w-60 rounded-2xl bg-white/95 p-4 text-ink-900 shadow-lift ring-1 ring-ink-900/5 backdrop-blur sm:block lg:end-[-1rem]">
            <p className="flex items-center justify-between gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5 text-primary-700">
                <FolderOpen aria-hidden="true" className="size-3.5" />
                תיק פרויקט
              </span>
              <span className="rounded-full bg-sand-100 px-2 py-0.5 text-2xs font-semibold text-sand-800">לדוגמה</span>
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700 ring-4 ring-primary-100">
                <span className="num text-base font-extrabold">82</span>
              </span>
              <span className="text-xs leading-5 text-ink-600">
                שלב היתר · שרון · <span className="num">220</span> מ״ר
                <br />
                שאל <span className="num">4</span> שאלות על אלומיניום
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Three measured proof points */}
      <div className="border-t border-white/10 bg-white/[0.03]">
        <dl className="container-page grid gap-x-8 gap-y-5 py-7 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-white/70">סרטונים שכבר עונים עד השנייה</dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight">
              <span className="num">{library.transcribed.toLocaleString('he-IL')}</span>
            </dd>
            <dd className="mt-1 text-xs text-white/55">
              ועוד <span className="num">{library.titleOnly.toLocaleString('he-IL')}</span> לפי כותרת ופרקים
            </dd>
          </div>
          <div>
            <dt className="text-sm text-white/70">כתובות מהאתר הישן שעובדות בחדש</dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight">
              <span className="num">
                {parity.passed.toLocaleString('he-IL')}/{parity.total.toLocaleString('he-IL')}
              </span>
            </dd>
            <dd className="mt-1 text-xs text-white/55">
              דוח ההתאמה, <span className="num">{hebrewShortDate(parity.checkedAt)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-white/70">טעינה בנייד, מהירה יותר</dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight">
              פי <span className="num">{speedup(oldLcp, newLcp)}</span>
            </dd>
            <dd className="mt-1 text-xs text-white/55">
              מ-<span className="num">{secondsLabel(oldLcp)}</span> ל-<span className="num">{secondsLabel(newLcp)}</span> שניות עד התוכן
              הראשי (Lighthouse)
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
