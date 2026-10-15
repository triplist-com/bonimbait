import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { stageHref, type BuildStage } from '@/lib/stages';

export interface JourneyNavigatorProps {
  /** Ordered stages (lib/stages.ts BUILD_STAGES). Any count works. */
  stages: readonly BuildStage[];
  /** Published articles per category slug (NFC). */
  counts?: Record<string, number>;
  /** Highlight a stage (e.g. the member's current stage, Wave B). */
  currentId?: BuildStage['id'];
  className?: string;
}

function countLabel(n: number | undefined) {
  if (!n) return null;
  return n === 1 ? 'מאמר אחד' : `${n.toLocaleString('he-IL')} מאמרים`;
}

/**
 * The build journey as a path: horizontal on desktop, a vertical timeline on
 * phones. Each stage links to its category of guides.
 */
export default function JourneyNavigator({ stages, counts = {}, currentId, className }: JourneyNavigatorProps) {
  return (
    <nav aria-label="שלבי הבנייה" className={className}>
      {/* Desktop: one row, connected */}
      <ol className="relative hidden grid-flow-col gap-3 lg:grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="absolute inset-x-[7%] top-[2.75rem] h-0.5 rounded-full bg-gradient-to-l from-primary-300 via-sand-300 to-sand-300" />
        {stages.map((stage) => {
          const current = stage.id === currentId;
          const count = countLabel(counts[stage.categorySlug.normalize('NFC')]);
          return (
            <li key={stage.id} className="relative">
              <Link
                href={stageHref(stage)}
                aria-current={current ? 'step' : undefined}
                className="group flex h-full flex-col items-center rounded-3xl px-2 pb-4 pt-1 text-center transition-colors hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                <span
                  className={cn(
                    'relative inline-flex size-[5.5rem] items-center justify-center rounded-[1.75rem] bg-white shadow-card ring-1 ring-sand-200 transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-card-hover',
                    current && 'ring-2 ring-primary-600',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner's small SVG icons */}
                  <img src={stage.icon} alt="" width={56} height={40} loading="lazy" decoding="async" className="h-10 w-14 object-contain" />
                  <span className="num absolute -top-2 end-[-0.5rem] inline-flex size-7 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white ring-4 ring-sand-50">
                    {stage.order}
                  </span>
                </span>
                <span className="mt-4 text-title-sm text-ink-900 group-hover:text-primary-700">{stage.label}</span>
                <span className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-snug text-ink-500">{stage.summary}</span>
                {count && <span className="mt-2 text-xs font-semibold text-primary-700">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ol>

      {/* Phones and tablets: vertical timeline */}
      <ol className="relative lg:hidden">
        <span aria-hidden="true" className="absolute bottom-8 start-[1.875rem] top-8 w-0.5 rounded-full bg-sand-300" />
        {stages.map((stage) => {
          const current = stage.id === currentId;
          const count = countLabel(counts[stage.categorySlug.normalize('NFC')]);
          return (
            <li key={stage.id} className="relative">
              <Link
                href={stageHref(stage)}
                aria-current={current ? 'step' : undefined}
                className="group flex min-h-[5rem] items-center gap-4 rounded-2xl py-2 pe-2 transition-colors active:bg-white/70"
              >
                <span
                  className={cn(
                    'relative inline-flex size-[3.75rem] shrink-0 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-sand-200',
                    current && 'ring-2 ring-primary-600',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner's small SVG icons */}
                  <img src={stage.icon} alt="" width={42} height={30} loading="lazy" decoding="async" className="h-[1.875rem] w-[2.625rem] object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="num text-xs font-bold text-ink-500">{String(stage.order).padStart(2, '0')}</span>
                    <span className="text-title text-ink-900">{stage.label}</span>
                  </span>
                  <span className="block truncate text-sm text-ink-500">{stage.summary}</span>
                  {count && <span className="mt-0.5 block text-xs font-semibold text-primary-700">{count}</span>}
                </span>
                <ArrowLeft aria-hidden="true" className="size-4 shrink-0 text-ink-400 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
