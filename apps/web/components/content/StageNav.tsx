import Link from 'next/link';
import { getStageLinks } from '@/lib/content/queries';

/** "איפה אתם במסע?": navigation by construction stage (post categories). */
export default async function StageNav({
  heading = 'איפה אתם במסע?',
  activeSlug,
}: {
  heading?: string | null;
  activeSlug?: string;
}) {
  const stages = await getStageLinks();
  return (
    <section aria-label="ניווט לפי שלב בניה" className="py-8">
      {heading && <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-5">{heading}</h2>}
      <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stages.map((s, i) => {
          const active = activeSlug === s.slug;
          return (
            <li key={s.slug}>
              <Link
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 h-full rounded-2xl border p-3.5 transition-all ${
                  active
                    ? 'border-primary bg-primary text-white shadow-md'
                    : 'border-gray-100 bg-white hover:border-primary-200 hover:shadow-card-hover'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-primary-50 text-primary group-hover:bg-primary group-hover:text-white transition-colors'
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span className={`text-sm font-semibold leading-snug ${active ? 'text-white' : 'text-gray-800'}`}>{s.name}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
