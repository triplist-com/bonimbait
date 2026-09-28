import Link from 'next/link';

/** Prev/next pagination that keeps the current filters in the query string. */
export default function AdminPagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v && k !== 'page') q.set(k, v);
    });
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50';
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm text-gray-600" aria-label="עימוד">
      <span>
        {from}–{to} מתוך {total.toLocaleString('he-IL')}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn}>
            → הקודם
          </Link>
        ) : (
          <span className={`${btn} opacity-40`}>→ הקודם</span>
        )}
        <span>
          עמוד {page} מתוך {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={btn}>
            הבא ←
          </Link>
        ) : (
          <span className={`${btn} opacity-40`}>הבא ←</span>
        )}
      </div>
    </nav>
  );
}

/** Parse ?page= (1-based). */
export function pageParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}
