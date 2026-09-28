import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { absoluteUrl } from '@/lib/site';

export type Crumb = { label: string; href?: string };

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <>
      <nav aria-label="פירורי לחם" className="text-sm text-gray-500">
        <ol className="flex flex-wrap items-center gap-1">
          {items.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">‹</span>}
              {c.href && i < items.length - 1 ? (
                <Link href={c.href} className="hover:text-primary">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={i === items.length - 1 ? 'page' : undefined} className="text-gray-700">
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: items.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.label,
            ...(c.href ? { item: absoluteUrl(c.href) } : {}),
          })),
        }}
      />
    </>
  );
}
