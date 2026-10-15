import { COMMUNITY_STATS } from '@/lib/brand';
import { SocialIcon } from '@/components/ui/SocialIcon';

/** Community numbers (lib/brand.ts), overlapping the hero's bottom edge. */
export default function ProofBar() {
  return (
    <section aria-label="הקהילה של בונים בית במספרים" className="relative z-10 -mt-12 sm:-mt-14">
      <div className="container-page">
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-ink-100 shadow-lift ring-1 ring-ink-900/5 lg:grid-cols-4">
          {COMMUNITY_STATS.map((s) => {
            const external = s.href.startsWith('http');
            return (
              <li key={s.id} className="bg-white">
                <a
                  href={s.href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="group flex h-full items-center gap-3 p-4 transition-colors hover:bg-ink-50 sm:gap-4 sm:p-6"
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white sm:size-12">
                    <SocialIcon id={s.id} className="size-5 sm:size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="num block text-2xl font-extrabold leading-none tracking-tight text-ink-900 sm:text-3xl">{s.value}</span>
                    <span className="mt-1 block text-xs leading-tight text-ink-500 sm:text-sm">
                      {s.label} ב-{s.network}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
