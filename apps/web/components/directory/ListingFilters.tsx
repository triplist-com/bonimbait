'use client';

import { useRef } from 'react';
import { SORT_OPTIONS, type ListingFilters as Filters, LISTING_PATH } from '@/lib/directory/listing';

type Option = { slug: string; name: string };

const selectClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/**
 * Plain GET form, so filtered listings are ordinary URLs (shareable,
 * crawlable, work without JS). With JS, changing a select submits at once.
 */
export default function ListingFilters({
  filters,
  specialties,
  regions,
}: {
  filters: Filters;
  specialties: Option[];
  regions: Option[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      action={LISTING_PATH}
      method="get"
      role="search"
      aria-label="חיפוש בעלי מקצוע"
      className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto]"
    >
      <label className="block">
        <span className="sr-only">בחרו התמחות</span>
        <select name="specialty" defaultValue={filters.specialty ?? ''} onChange={submit} className={selectClass}>
          <option value="">כל ההתמחויות</option>
          {specialties.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">בחרו אזור</span>
        <select name="region" defaultValue={filters.region ?? ''} onChange={submit} className={selectClass}>
          <option value="">כל האזורים</option>
          {regions.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">חיפוש חופשי</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="חיפוש חופשי: שם עסק, תחום…"
          maxLength={80}
          className={selectClass}
        />
      </label>
      {filters.sort !== 'default' && <input type="hidden" name="sort_by" value={filters.sort} />}
      <button
        type="submit"
        className="rounded-xl bg-primary px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 sm:col-span-2 lg:col-span-1"
      >
        מצא בעל מקצוע
      </button>
    </form>
  );
}

/** Sort select: navigates to the same filters with another sort_by. */
export function SortSelect({ current, hrefs }: { current: Filters['sort']; hrefs: Record<Filters['sort'], string> }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">מיון</span>
      <select
        value={current}
        onChange={(e) => {
          window.location.href = hrefs[e.target.value as Filters['sort']];
        }}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-900 focus:border-primary focus:outline-none"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
