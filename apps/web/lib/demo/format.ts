/** Hebrew display helpers for demo views. Client-safe. */

/** "ממש עכשיו", "לפני 5 דקות", "לפני שעתיים", "אתמול", "לפני 3 ימים". */
export function agoHe(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'ממש עכשיו';
  if (m === 1) return 'לפני דקה';
  if (m < 60) return `לפני ${m} דקות`;
  const h = Math.floor(m / 60);
  if (h === 1) return 'לפני שעה';
  if (h === 2) return 'לפני שעתיים';
  if (h < 24) return `לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'אתמול';
  if (d === 2) return 'לפני יומיים';
  if (d < 7) return `לפני ${d} ימים`;
  const w = Math.floor(d / 7);
  return w === 1 ? 'לפני שבוע' : w === 2 ? 'לפני שבועיים' : `לפני ${w} שבועות`;
}

export function formatNumberHe(value: number): string {
  return value.toLocaleString('he-IL');
}

/** +12% / -3% change between two totals. */
export function changePercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/** "14 באוק׳" style short date for chart labels. */
export function shortDateHe(date: string): string {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
