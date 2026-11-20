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
  return `כ-${fmtNum(Math.round(m * 2) / 2)} חודשי עבודה`;
}
