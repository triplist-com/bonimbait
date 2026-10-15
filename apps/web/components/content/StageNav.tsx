import Link from 'next/link';
import { cn } from '@/lib/cn';
import { BUILD_STAGES, stageHref } from '@/lib/stages';

/**
 * "איפה אתם במסע?": the owner's 7 build stages (lib/stages.ts) with their
 * icons. A swipe row on phones, one row on desktop.
 */
export default function StageNav({
  heading = 'איפה אתם במסע?',
  activeSlug,
  className,
}: {
  heading?: string | null;
  activeSlug?: string;
  className?: string;
}) {
  const active = activeSlug?.normalize('NFC');
  return (
    <section aria-label="ניווט לפי שלב בנייה" className={cn('py-8', className)}>
      {heading && <h2 className="mb-5 text-headline-sm text-ink-900">{heading}</h2>}
      <ol className="rail -mx-4 scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:gap-3 lg:overflow-visible lg:px-0">
        {BUILD_STAGES.map((s) => {
          const isActive = active === s.categorySlug.normalize('NFC');
          return (
            <li key={s.id} className="w-[7.5rem] sm:w-[8.5rem] lg:w-auto">
              <Link
                href={stageHref(s)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group flex h-full flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-[box-shadow,border-color,transform] duration-300',
                  isActive
                    ? 'border-ink-900 bg-ink-900 text-white shadow-lift'
                    : 'border-ink-100 bg-white hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-card-hover',
                )}
              >
                <span className={cn('relative inline-flex size-14 items-center justify-center rounded-xl', isActive ? 'bg-white' : 'bg-sand-50')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner's small SVG icons */}
                  <img src={s.icon} alt="" width={40} height={28} className="h-7 w-10 object-contain" />
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className={cn('num text-xs font-bold', isActive ? 'text-primary-300' : 'text-ink-500')}>{s.order}</span>
                  <span className={cn('text-sm font-bold', isActive ? 'text-white' : 'text-ink-900 group-hover:text-primary-700')}>{s.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
