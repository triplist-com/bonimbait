/**
 * Hebrew labels for the advisor UI and prompt. Pure and client-safe (the
 * prompt module imports from here, never the other way round, so the system
 * prompt stays out of browser bundles).
 */
import type { AdvisorStats } from './types';

export const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** "28:34" / "1:02:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "יולי 2026". */
export function monthYear(iso: string | null | undefined): string | null {
  const d = parseDate(iso);
  return d ? `${HE_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : null;
}

/** "ביולי 2026" (prompt source headers). */
export function publishedLabel(iso: string | null | undefined): string | null {
  const my = monthYear(iso);
  return my ? `ב${my}` : null;
}

/** "רגע אחד" / "7 רגעים". */
function moments(n: number): string {
  return n === 1 ? 'רגע אחד' : `${n} רגעים`;
}

/**
 * "מצאנו 7 רגעים ב-3 סרטונים ו-2 מאמרים", or null when nothing was found.
 * Grammar: "בסרטון אחד ובמאמר אחד", "ב-3 סרטונים ובמאמר אחד", "במאמר אחד".
 */
export function statsLine(stats: AdvisorStats | null | undefined): string | null {
  if (!stats || stats.moments <= 0 || stats.videos + stats.articles <= 0) return null;
  const { videos: v, articles: a } = stats;
  const videoPart = v === 1 ? 'בסרטון אחד' : `ב-${v} סרטונים`;
  let where: string;
  if (v > 0 && a > 0) where = `${videoPart} ${a === 1 ? 'ובמאמר אחד' : `ו-${a} מאמרים`}`;
  else if (v > 0) where = videoPart;
  else where = a === 1 ? 'במאמר אחד' : `ב-${a} מאמרים`;
  return `מצאנו ${moments(stats.moments)} ${where}`;
}

/** "עכשיו" / "לפני 5 דקות" / "אתמול" / "12 באוקטובר". */
export function whenLabel(iso: string | null | undefined, now = Date.now()): string {
  const d = parseDate(iso);
  if (!d) return '';
  const minutes = Math.round((now - d.getTime()) / 60_000);
  if (minutes < 1) return 'עכשיו';
  if (minutes < 60) return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return `${d.getDate()} ב${HE_MONTHS[d.getMonth()]}`;
}
