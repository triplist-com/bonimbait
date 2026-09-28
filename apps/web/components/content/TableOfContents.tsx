import type { TocItem } from '@/lib/content/sanitize';

/** Minimum number of headings before a post gets a table of contents. */
export const TOC_MIN_ITEMS = 4;

function TocList({ items }: { items: TocItem[] }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {items.map((item) => (
        <li key={item.id} className={item.level === 3 ? 'ps-4' : ''}>
          <a
            href={`#${item.id}`}
            className={`block leading-snug py-0.5 transition-colors hover:text-primary ${
              item.level === 2 ? 'text-gray-700 font-medium' : 'text-gray-500'
            }`}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Collapsible table of contents shown above the article body (mobile + tablet). */
export function TocInline({ items }: { items: TocItem[] }) {
  if (items.length < TOC_MIN_ITEMS) return null;
  return (
    <details className="lg:hidden mb-8 rounded-2xl border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-5 py-4 font-bold text-gray-900 flex items-center justify-between">
        תוכן העניינים
        <span className="text-xs font-normal text-gray-400">{items.length} סעיפים</span>
      </summary>
      <div className="px-5 pb-5">
        <TocList items={items} />
      </div>
    </details>
  );
}

/** Sticky sidebar table of contents (desktop). */
export function TocSidebar({ items }: { items: TocItem[] }) {
  if (items.length < TOC_MIN_ITEMS) return null;
  return (
    <nav aria-label="תוכן העניינים" className="hidden lg:block sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
      <p className="font-bold text-gray-900 mb-3">תוכן העניינים</p>
      <TocList items={items} />
    </nav>
  );
}
