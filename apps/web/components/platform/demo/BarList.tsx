import { formatNumberHe } from '@/lib/demo/format';

type Row = { key: string; label: string; value: number };

/**
 * Horizontal bars for one measure across categories: one hue for every bar
 * (no value ramp on nominal categories), square at the start, 4px rounded
 * end, value at the tip in ink. Bars grow from the start edge (right in RTL).
 */
export default function BarList({ title, description, rows, unit }: { title: string; description?: string; rows: readonly Row[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <span className="truncate text-gray-700" title={r.label}>
              {r.label}
            </span>
            <span className="flex items-center gap-2" title={`${r.label}: ${formatNumberHe(r.value)} ${unit}`}>
              <span className="h-3 shrink-0 rounded-e-[4px] bg-primary-500" style={{ width: `${Math.max(2, (r.value / max) * 82)}%` }} />
              <bdi className="tabular-nums text-gray-700">{formatNumberHe(r.value)}</bdi>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
