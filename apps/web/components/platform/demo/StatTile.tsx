type Props = {
  label: string;
  /** Already formatted (e.g. "12,840", "2.4%"). */
  value: string;
  /** Signed percent change; up is good for every demo KPI. */
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
};

/** KPI tile: label · value · signed delta vs a named period (arrow + color, never color alone). */
export default function StatTile({ label, value, delta, deltaLabel = 'לעומת 28 הימים הקודמים', hint }: Props) {
  const tone = delta == null || delta === 0 ? 'text-gray-600' : delta > 0 ? 'text-success-700' : 'text-danger-700';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 sm:text-3xl">
        <bdi>{value}</bdi>
      </p>
      {delta != null ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
          <span dir="ltr" className={`font-semibold ${tone}`}>
            <span aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'}</span> {delta > 0 ? '+' : ''}
            {delta}%
          </span>
          <span className="text-gray-500">{deltaLabel}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
