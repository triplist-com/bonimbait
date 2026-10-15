/**
 * Period windows and deltas for the Command Center. Pure and client-safe.
 *
 * A period of N days covers N Israel calendar days ending today: from Israel
 * midnight N-1 days ago until now, so a daily chart has exactly N bars. The
 * previous period starts N days earlier and runs for the SAME elapsed time
 * (N-1 full days plus as much of its last day as today has had), so a
 * comparison made at 10:00 isn't a partial day against a full one.
 */
import { PERIODS, type Delta, type PeriodDays, type Point } from './types';

export const TZ = 'Asia/Jerusalem';
export const DEFAULT_PERIOD: PeriodDays = 30;
const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePeriod(value: unknown): PeriodDays {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as PeriodDays) : DEFAULT_PERIOD;
}

function toMs(value: Date | number | string): number {
  return value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Israel calendar date (YYYY-MM-DD) of an instant. */
export function israelDay(value: Date | number | string): string {
  return dayFormat.format(new Date(toMs(value)));
}

/** The UTC calendar date (YYYY-MM-DD) of an instant: the AI budget day. */
export function utcDayOf(value: Date | number | string): string {
  return new Date(toMs(value)).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  if (!DATE_RE.test(day)) throw new Error(`Not a YYYY-MM-DD date: ${day}`);
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Minutes Israel is ahead of UTC at an instant (+120 winter, +180 summer). */
function israelOffsetMinutes(ms: number): number {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** The UTC instant (ms) of 00:00 Israel time on `day`. DST in Israel moves at 02:00, so midnight is unambiguous. */
export function israelMidnight(day: string): number {
  if (!DATE_RE.test(day)) throw new Error(`Not a YYYY-MM-DD date: ${day}`);
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  const first = guess - israelOffsetMinutes(guess) * 60_000;
  const second = guess - israelOffsetMinutes(first) * 60_000;
  return second;
}

export type PeriodWindow = {
  days: PeriodDays;
  /** ISO instants: current [from, to), previous [prevFrom, prevTo). */
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** Israel dates of the current period, oldest first (length = days). */
  dayList: string[];
  /** Israel dates of the previous period, oldest first. */
  prevDayList: string[];
};

export function periodWindow(now: Date | number | string, days: PeriodDays): PeriodWindow {
  const nowMs = toMs(now);
  const today = israelDay(nowMs);
  const startDay = addDays(today, -(days - 1));
  const from = israelMidnight(startDay);
  const prevStartDay = addDays(startDay, -days);
  const prevFrom = israelMidnight(prevStartDay);
  const elapsed = Math.max(0, nowMs - from);
  return {
    days,
    from: new Date(from).toISOString(),
    to: new Date(nowMs).toISOString(),
    prevFrom: new Date(prevFrom).toISOString(),
    prevTo: new Date(Math.min(from, prevFrom + elapsed)).toISOString(),
    dayList: Array.from({ length: days }, (_, i) => addDays(startDay, i)),
    prevDayList: Array.from({ length: days }, (_, i) => addDays(prevStartDay, i)),
  };
}

/** Is `at` inside [from, to)? */
export function inRange(at: string | number | Date, from: string, to: string): boolean {
  const t = toMs(at);
  return t >= Date.parse(from) && t < Date.parse(to);
}

export function periodDelta(current: number, previous: number): Delta {
  const cur = Number.isFinite(current) ? current : 0;
  const prev = Number.isFinite(previous) ? previous : 0;
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const direction = cur > prev ? 'up' : cur < prev ? 'down' : 'flat';
  return { current: cur, previous: prev, pct, direction };
}

/** A zero-filled daily series over `days` from sparse { day -> value } data. */
export function fillDaily(days: readonly string[], values: ReadonlyMap<string, number> | Record<string, number>): Point[] {
  const get = (d: string) => (values instanceof Map ? values.get(d) : (values as Record<string, number>)[d]);
  return days.map((date) => ({ date, value: get(date) ?? 0 }));
}

export function sumPoints(points: readonly Point[]): number {
  return points.reduce((a, p) => a + p.value, 0);
}

/** Minutes between two instants (>= 0). */
export function minutesBetween(from: string | number | Date, to: string | number | Date): number {
  return Math.max(0, Math.round((toMs(to) - toMs(from)) / 60_000));
}
