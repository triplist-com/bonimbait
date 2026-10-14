import { formatNumberHe, shortDateHe } from '@/lib/demo/format';

type Point = { date: string; value: number };

/** Round up to a clean axis maximum (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^n) so the plot fills most of its height. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = Math.round(step * magnitude * 1e6) / 1e6;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/**
 * Daily single-series column chart (server-rendered HTML, no JS). One hue,
 * thin columns with a 2px gap, 4px rounded data-end, hairline grid, time
 * flowing left to right. Hover shows the day's value; the table below is the
 * accessible twin. No legend: the title names the one series.
 */
export default function DailyColumns({
  title,
  description,
  points,
  unit,
}: {
  title: string;
  description?: string;
  points: readonly Point[];
  unit: string;
}) {
  if (points.length === 0) return null;
  const top = niceCeil(Math.max(...points.map((p) => p.value)));
  const last = points[points.length - 1];
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);
  const ticks = [top, top / 2, 0];
  const xLabels = [points[0], points[Math.floor((points.length - 1) / 2)], last];

  return (
    <figure className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <figcaption>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        <p className="mt-1 text-sm text-gray-600">
          היום: <bdi className="font-semibold text-gray-900">{formatNumberHe(last.value)}</bdi> · שיא:{' '}
          <bdi className="font-semibold text-gray-900">{formatNumberHe(peak.value)}</bdi> ({shortDateHe(peak.date)})
        </p>
      </figcaption>

      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2" dir="ltr" aria-hidden="true">
        <div className="relative h-40 w-8 text-end text-[11px] tabular-nums leading-none text-gray-500">
          {ticks.map((t, i) => (
            <span key={t} className="absolute end-0" style={{ top: `${(i / (ticks.length - 1)) * 100}%`, transform: 'translateY(-50%)' }}>
              {t >= 1000 ? `${Math.round(t / 100) / 10}K` : t}
            </span>
          ))}
        </div>
        <div className="relative h-40">
          {[0, 50, 100].map((pct) => (
            <div key={pct} className="absolute inset-x-0 border-t border-gray-100" style={{ top: `${pct}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {points.map((p) => (
              <div key={p.date} className="group flex h-full flex-1 items-end justify-center" title={`${shortDateHe(p.date)}: ${formatNumberHe(p.value)} ${unit}`}>
                <div
                  className="w-full max-w-[24px] rounded-t-[4px] bg-primary-500 transition-colors group-hover:bg-primary-700"
                  style={{ height: `${Math.max(1, (p.value / top) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        <div />
        <div className="mt-2 flex justify-between text-xs tabular-nums text-gray-500">
          {xLabels.map((p) => (
            <span key={p.date}>{shortDateHe(p.date)}</span>
          ))}
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-primary-700">הצגת הנתונים כטבלה</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">תאריך</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{unit}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points.map((p) => (
                <tr key={p.date} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-gray-700">{shortDateHe(p.date)}</td>
                  <td className="px-3 py-1.5 text-gray-900">{formatNumberHe(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
