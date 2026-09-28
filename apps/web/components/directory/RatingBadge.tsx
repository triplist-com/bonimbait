import { reviewCountLabel } from '@/lib/directory/format';

/** Live-style rating: overall percent + review count. */
export default function RatingBadge({
  percent,
  count,
  size = 'md',
}: {
  percent: number | null | undefined;
  count: number;
  size?: 'md' | 'lg';
}) {
  if (!count) {
    return <span className="text-sm text-gray-500">עדיין אין חוות דעת</span>;
  }
  const big = size === 'lg';
  return (
    <span className="inline-flex items-center gap-2" aria-label={`ציון ${percent ?? 0}% מתוך ${reviewCountLabel(count)}`}>
      <span
        className={`rounded-full bg-emerald-50 font-bold text-emerald-700 ${big ? 'px-3 py-1 text-lg' : 'px-2 py-0.5 text-sm'}`}
      >
        {percent ?? 0}%
      </span>
      <span className={`text-gray-600 ${big ? 'text-base' : 'text-sm'}`}>{reviewCountLabel(count)}</span>
    </span>
  );
}
