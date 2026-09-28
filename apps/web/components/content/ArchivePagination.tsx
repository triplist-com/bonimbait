import Link from 'next/link';
import { pagedPath } from '@/lib/content/seo';

interface ArchivePaginationProps {
  /** Archive root, e.g. "/blog/" or "/category/שלב-שלד/". */
  basePath: string;
  currentPage: number;
  totalPages: number;
}

/** Link-based pagination using WordPress URLs (/<base>/page/<n>/). */
export default function ArchivePagination({ basePath, currentPage, totalPages }: ArchivePaginationProps) {
  if (totalPages <= 1) return null;

  const pages: Array<number | 'gap'> = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) pages.push(i);
    else if (pages[pages.length - 1] !== 'gap') pages.push('gap');
  }

  const base = 'min-w-[2.5rem] h-10 px-3 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors';
  const idle = 'border border-gray-200 text-gray-700 hover:bg-primary-50 hover:border-primary hover:text-primary';

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 py-10" aria-label="ניווט בין עמודים">
      {currentPage > 1 && (
        <Link href={pagedPath(basePath, currentPage - 1)} rel="prev" className={`${base} ${idle}`}>
          הקודם
        </Link>
      )}
      {pages.map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-gray-400">
            …
          </span>
        ) : p === currentPage ? (
          <span key={p} aria-current="page" className={`${base} bg-primary text-white shadow-md`}>
            {p}
          </span>
        ) : (
          <Link key={p} href={pagedPath(basePath, p)} className={`${base} ${idle}`}>
            {p}
          </Link>
        ),
      )}
      {currentPage < totalPages && (
        <Link href={pagedPath(basePath, currentPage + 1)} rel="next" className={`${base} ${idle}`}>
          הבא
        </Link>
      )}
    </nav>
  );
}
