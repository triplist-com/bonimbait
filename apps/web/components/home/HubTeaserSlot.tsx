import type { ReactNode } from 'react';
import { ArrowLeft, Bookmark, Check, ListChecks, UsersRound } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Progress, Steps } from '@/components/ui/Steps';
import { HUB_TEASER } from '@/lib/home/content';
import { BUILD_STAGES } from '@/lib/stages';

/**
 * Slot for "הבית שלי" (Builder Hub, Wave B). Today it links to /account/;
 * the hub squad replaces the preview with the member's real roadmap by
 * passing `preview` (or swaps the whole slot) without touching the page.
 */
export interface HubTeaserSlotProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  href?: string;
  points?: readonly string[];
  /** Replace the illustrative preview (e.g. with live member data). */
  preview?: ReactNode;
}

function DefaultPreview() {
  const current = 3; // illustrative: a family in the frame stage
  return (
    <div aria-hidden="true" className="rounded-2xl bg-white p-5 text-ink-900 shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">הבית של משפחת לוי</p>
        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">שלב השלד</span>
      </div>
      <Progress value={current} max={BUILD_STAGES.length} label="התקדמות בפרויקט" showValue size="sm" className="mt-4" />
      <Steps
        steps={BUILD_STAGES.slice(2, 6).map((s) => ({ label: s.label }))}
        current={1}
        startAt={3}
        className="mt-5"
        label="שלבים קרובים"
      />
      <ul className="mt-5 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: Bookmark, n: '14', l: 'שמורים' },
          { icon: UsersRound, n: '3', l: 'אנשי מקצוע' },
          { icon: ListChecks, n: '8/12', l: 'משימות' },
        ].map(({ icon: Icon, n, l }) => (
          <li key={l} className="rounded-xl bg-ink-50 px-2 py-2.5">
            <Icon className="mx-auto size-4 text-primary-600" />
            <span className="num mt-1 block text-sm font-bold">{n}</span>
            <span className="block text-[0.6875rem] text-ink-500">{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HubTeaserSlot({
  eyebrow = HUB_TEASER.eyebrow,
  title = HUB_TEASER.title,
  subtitle = HUB_TEASER.subtitle,
  cta = HUB_TEASER.cta,
  href = HUB_TEASER.href,
  points = HUB_TEASER.points,
  preview,
}: HubTeaserSlotProps) {
  return (
    <section
      aria-labelledby="hub-title"
      className="relative isolate overflow-hidden rounded-[2rem] bg-ink-950 p-6 text-white sm:p-10 lg:p-12"
    >
      <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10" />
      <span aria-hidden="true" className="absolute -bottom-32 -start-24 -z-10 size-96 rounded-full bg-primary-600/30 blur-3xl" />
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow !text-primary-300">{eyebrow}</p>
          <h2 id="hub-title" className="mt-3 text-headline text-white">
            {title}
          </h2>
          <p className="mt-3 text-body-lg text-white/75">{subtitle}</p>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[0.9375rem] text-white/85">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-600/20 text-primary-300">
                  <Check aria-hidden="true" className="size-3.5" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <ButtonLink href={href} size="lg" className="mt-8" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
            {cta}
          </ButtonLink>
        </div>
        <div className="mx-auto w-full max-w-md lg:me-0">{preview ?? <DefaultPreview />}</div>
      </div>
    </section>
  );
}
