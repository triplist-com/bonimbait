/**
 * Display formatters shared by UI primitives. Client-safe, pure.
 */

/** 543 -> "9:03", 3725 -> "1:02:05". Accepts seconds as number or numeric string. */
export function formatDuration(input: number | string | null | undefined): string | null {
  const total = typeof input === 'string' ? Number(input) : input;
  if (total === null || total === undefined || !Number.isFinite(total) || total <= 0) return null;
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Spoken form for screen readers: 543 -> "9 דקות ו-3 שניות". */
export function durationLabel(input: number | string | null | undefined): string | null {
  const total = typeof input === 'string' ? Number(input) : input;
  if (total === null || total === undefined || !Number.isFinite(total) || total <= 0) return null;
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? 'שעה' : `${h} שעות`);
  if (m) parts.push(m === 1 ? 'דקה' : `${m} דקות`);
  if (sec && !h) parts.push(sec === 1 ? 'שנייה' : `${sec} שניות`);
  if (parts.length <= 1) return parts[0] ?? null;
  return `${parts.slice(0, -1).join(', ')} ו-${parts[parts.length - 1]}`;
}

/** Hebrew-locale integer: 10000 -> "10,000". */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('he-IL');
}

/**
 * Normalise a rating to a 5-star value, rounded to the nearest half.
 * toFiveStars(9.6, 10) -> 5, toFiveStars(7.3, 10) -> 3.5, toFiveStars(4.2) -> 4.
 */
export function toFiveStars(value: number | null | undefined, scale = 5): number {
  if (value === null || value === undefined || !Number.isFinite(value) || scale <= 0) return 0;
  const five = Math.min(5, Math.max(0, (value / scale) * 5));
  return Math.round(five * 2) / 2;
}

/** Podcast episode from a title: "פודקאסט פרק 112 – …" -> "112". */
export function episodeNumber(title: string): string | null {
  const m = title.match(/פרק\s*(\d{1,4})/);
  return m ? m[1] : null;
}
