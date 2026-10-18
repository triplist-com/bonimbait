import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Clock, Play, PlayCircle, Sparkles } from 'lucide-react';
import AskForm from '@/components/ask/AskForm';
import { ChipLink } from '@/components/ui/Chip';
import { CHANNEL_TRAILER, COMMUNITY_STATS } from '@/lib/brand';
import { HERO_COPY, HERO_MOMENT } from '@/lib/home/content';
import { EXAMPLE_QUESTIONS } from '@/lib/home/questions';
import type { KnowledgeStats } from '@/lib/home/stats';
import { aiHref } from '@/lib/nav';
import { formatDuration } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import TrailerFacade from './TrailerFacade';

const STAT_ICONS = [PlayCircle, Clock, BookOpen];

/** Hero: the owner's line, the question box, live counts and the trailer. */
export default function Hero({ stats }: { stats: KnowledgeStats }) {
  const parts = [
    stats.videos > 0 && { value: stats.videos, label: 'סרטונים' },
    stats.hours > 0 && { value: stats.hours, label: 'שעות וידאו' },
    stats.articles > 0 && { value: stats.articles, label: 'מאמרים' },
  ].filter(Boolean) as Array<{ value: number; label: string }>;
  const whatsapp = COMMUNITY_STATS.find((s) => s.id === 'whatsapp');
  const momentHref = `/video/${HERO_MOMENT.youtubeId}/?t=${HERO_MOMENT.startSeconds}`;

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      {/* Decorative backdrop: blueprint grid + warm and brand glows */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="bg-blueprint mask-fade-b absolute inset-x-0 top-0 h-[34rem]" />
        <div className="absolute -top-32 end-[-10%] size-[38rem] rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute -top-24 start-[-12%] size-[30rem] rounded-full bg-sand-200/60 blur-3xl" />
      </div>

      <div className="container-page pb-20 pt-8 sm:pb-24 sm:pt-12 lg:pb-28 lg:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Copy + ask */}
          <div className="lg:col-span-7">
            <p className="inline-flex items-center gap-2.5 rounded-full border border-ink-200/80 bg-white/80 py-1 pe-4 ps-1 text-sm font-medium text-ink-700 shadow-xs backdrop-blur">
              <Image
                src={mediaUrl('uploads/mp-v6/team/tomer-white.webp')}
                alt=""
                width={64}
                height={64}
                sizes="32px"
                className="size-8 rounded-full object-cover object-top ring-2 ring-white"
              />
              {HERO_COPY.host}
            </p>

            <h1 id="hero-title" className="mt-5 text-display-xl text-ink-900">
              {HERO_COPY.title.lead}{' '}
              <span className="relative inline-block whitespace-nowrap text-primary-600">
                {HERO_COPY.title.highlight}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 220 16"
                  preserveAspectRatio="none"
                  className="absolute -bottom-2 start-0 h-3 w-full text-primary-300 sm:-bottom-3 sm:h-4"
                >
                  <path d="M3 11 C 48 4, 120 3, 217 8" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-body-lg text-ink-600 sm:text-[1.3125rem] sm:leading-[1.7]">{HERO_COPY.subline}</p>

            <div className="mt-8 max-w-2xl">
              <AskForm size="xl" rotate placeholder={HERO_COPY.placeholder} label="מה תרצו לשאול?" />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="me-1 text-sm font-medium text-ink-500">{HERO_COPY.chipsLabel}</span>
                {EXAMPLE_QUESTIONS.slice(1, 4).map((q) => (
                  <ChipLink key={q.text} href={aiHref(q.text)} size="sm" prefetch={false}>
                    {q.text}
                  </ChipLink>
                ))}
              </div>
            </div>

            {parts.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-ink-200/70 pt-6">
                <p className="text-sm font-semibold text-ink-900">התשובות מבוססות על:</p>
                <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  {parts.map((p, i) => {
                    const Icon = STAT_ICONS[i] ?? BookOpen;
                    return (
                      <li key={p.label} className="inline-flex items-center gap-2 text-sm text-ink-700">
                        <Icon aria-hidden="true" className="size-4 text-primary-600" />
                        <span>
                          <span className="num font-bold text-ink-900">{p.value.toLocaleString('he-IL')}</span> {p.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="w-full text-caption text-ink-500">{HERO_COPY.finePrint}</p>
              </div>
            )}
          </div>

          {/* Visual */}
          <div className="relative lg:col-span-5">
            <TrailerFacade
              youtubeId={CHANNEL_TRAILER.youtubeId}
              title={CHANNEL_TRAILER.title}
              poster={CHANNEL_TRAILER.poster}
              posterWidth={CHANNEL_TRAILER.posterWidth}
              posterHeight={CHANNEL_TRAILER.posterHeight}
              cta="הכירו את בונים בית"
            />

            {/* A real answer moment: opens the video at that second */}
            <Link
              href={momentHref}
              prefetch={false}
              className="group relative z-10 mx-auto -mt-6 flex w-[min(100%-2rem,22rem)] items-center gap-3 rounded-2xl bg-white p-3 shadow-lift ring-1 ring-ink-900/5 transition-transform hover:-translate-y-0.5 lg:absolute lg:-bottom-12 lg:start-[-2.5rem] lg:mx-0 lg:mt-0 lg:w-[21rem] motion-safe:lg:animate-float"
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
                <span className="mt-0.5 block truncate text-sm font-bold text-ink-900">{HERO_MOMENT.question}</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  הרגע המדויק בסרטון: <span className="num font-semibold text-ink-800">{formatDuration(HERO_MOMENT.startSeconds)}</span>
                </span>
              </span>
            </Link>

            {whatsapp && (
              <div className="absolute -top-5 end-4 hidden items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-lift ring-1 ring-ink-900/5 backdrop-blur lg:flex">
                <span className="flex -space-x-2 rtl:space-x-reverse" aria-hidden="true">
                  {['tomer', 'zuri', 'shani-levi'].map((n) => (
                    <Image
                      key={n}
                      src={mediaUrl(`uploads/mp-v6/team/${n}-white.webp`)}
                      alt=""
                      width={56}
                      height={56}
                      sizes="28px"
                      className="size-7 rounded-full object-cover object-top ring-2 ring-white"
                    />
                  ))}
                </span>
                <span className="text-sm leading-tight">
                  <span className="num block font-extrabold text-ink-900">{whatsapp.value}</span>
                  <span className="text-xs text-ink-500">חברי קהילה ב-WhatsApp</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
