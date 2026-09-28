import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { breadcrumbJsonLd, type Crumb } from '@/lib/content/seo';

/** Visible breadcrumbs + BreadcrumbList JSON-LD. The last crumb is the current page. */
export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <>
      <StructuredData data={breadcrumbJsonLd(crumbs)} />
      <nav aria-label="פירורי לחם" className="text-sm text-gray-500">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${c.href}-${i}`} className="flex items-center gap-1.5 min-w-0">
                {last ? (
                  <span aria-current="page" className="text-gray-700 truncate max-w-[16rem] sm:max-w-md">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="hover:text-primary transition-colors">
                    {c.label}
                  </Link>
                )}
                {!last && (
                  <svg className="w-3.5 h-3.5 text-gray-300 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
