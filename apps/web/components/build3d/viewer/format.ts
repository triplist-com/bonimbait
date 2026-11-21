const nf = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

export const fmtNum = (n: number) => nf.format(n);
export const fmtInt = (n: number) => nf0.format(Math.round(n));
export const fmtILS = (n: number) => `${nf0.format(Math.round(n))} ₪`;

export function fmtDays(d: number): string {
  if (d === 1) return 'יום עבודה אחד';
  return `${fmtNum(d)} ימי עבודה`;
}

export function fmtMonths(days: number): string {
  // ~22 working days a month.
  const m = days / 22;
  if (m < 1) return `${fmtInt(days)} ימי עבודה`;
  return `כ-${fmtNum(Math.round(m * 2) / 2)} חודשים`;
}

/** Phase names from the engine use a dash ("קומה תחתונה — שלד"); the UI writes them with a colon. */
export const phaseLabel = (name: string) => name.replace(' — ', ': ');

/** Shared focus ring for icon buttons. */
export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white';
