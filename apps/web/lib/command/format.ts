/**
 * Number formatting for the Command Center. Client-safe. Every value is meant
 * to sit inside an LTR island (<bdi> / dir="ltr") in the RTL page.
 */

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function compactNumber(value: number, digits = 1): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmtTwo = (v: number, suffix: string) => `${sign}${(Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '')}${suffix}`;
  const fmt = (v: number, suffix: string) => {
    const rounded = Math.round(v * 10 ** digits) / 10 ** digits;
    return `${sign}${rounded.toFixed(digits).replace(/\.0+$/, '')}${suffix}`;
  };
  if (abs >= 1_000_000) return abs < 10_000_000 ? fmtTwo(abs / 1_000_000, 'M') : fmt(abs / 1_000_000, 'M');
  if (abs >= 10_000) return fmt(abs / 1000, 'K');
  return `${sign}${int.format(abs)}`;
}

/** "1,284", or "12.9K" / "1.4M" when compact. */
export function formatCount(value: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '—';
  return opts.compact ? compactNumber(value) : int.format(Math.round(value));
}

/** Whole shekels from agorot: "₪6,900", or "₪1.4M" / "₪14.5K" when compact. */
export function formatNis(agorot: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(agorot)) return '—';
  const nis = Math.round(agorot / 100);
  return `₪${opts.compact ? compactNumber(nis) : int.format(nis)}`;
}

export function formatNisWhole(nis: number, opts: { compact?: boolean } = {}): string {
  return formatNis(nis * 100, opts);
}

/** "$0.0031", "$0.73", "$3". */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return '—';
  if (usd === 0) return '$0';
  const abs = Math.abs(usd);
  if (abs < 0.01) return `$${usd.toFixed(4)}`;
  if (abs < 10) return `$${usd.toFixed(2).replace(/\.00$/, '')}`;
  return `$${int.format(Math.round(usd))}`;
}

/** 0.234 -> "23%". */
export function formatShare(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Signed percent for deltas: "+12%", "-3%", "0%". */
export function formatDeltaPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

/** Hebrew duration from minutes: "12 דק׳", "3.5 שע׳", "2 ימים". */
export function formatDurationHe(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const m = Math.max(0, minutes);
  if (m < 60) return `${Math.round(m)} דק׳`;
  const h = m / 60;
  if (h < 48) return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} שע׳`;
  const d = Math.round(h / 24);
  return d === 1 ? 'יום' : `${d} ימים`;
}

/** Budget range in shekels: [1500000, 2000000] -> "₪1.5M–2M". */
export function formatBudgetRange(range: readonly [number, number]): string {
  const [lo, hi] = range;
  const short = (n: number) => compactNumber(n);
  if (lo > 0 && hi > 0) return `₪${short(lo)}–${short(hi)}`;
  if (hi > 0) return `עד ₪${short(hi)}`;
  return `מ-₪${short(lo)}`;
}

/** "14 באוק׳" for chart labels (dates are Israel calendar dates). */
export function shortDayHe(day: string): string {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}
