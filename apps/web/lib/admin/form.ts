/**
 * FormData helpers for admin server actions (strings in, typed values out).
 */
import { ActionError } from './errors';

export function str(fd: FormData, name: string, max = 10_000): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/** Trimmed string or null when empty. */
export function optStr(fd: FormData, name: string, max = 10_000): string | null {
  const v = str(fd, name, max);
  return v === '' ? null : v;
}

/** Raw (untrimmed) HTML field. */
export function html(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === 'on' || v === 'true' || v === '1';
}

export function int(fd: FormData, name: string, fallback = 0): number {
  const n = Number.parseInt(str(fd, name, 20), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function optInt(fd: FormData, name: string): number | null {
  const raw = str(fd, name, 20);
  if (raw === '') return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Shekel amount ("1,290.50") -> agorot. Null when empty. */
export function shekelsToAgorot(value: string): number | null {
  const clean = value.replace(/[,\s₪]/g, '');
  if (clean === '') return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0) throw new ActionError('סכום לא תקין');
  return Math.round(n * 100);
}

export function ids(fd: FormData, name: string): string[] {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Array.from(new Set(fd.getAll(name).filter((v): v is string => typeof v === 'string' && uuid.test(v))));
}

/** Comma/newline separated list. */
export function list(fd: FormData, name: string): string[] {
  return str(fd, name, 20_000)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function uuidOrNull(value: string | null): string | null {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** <input type="datetime-local"> value (Israel time) -> ISO. */
export function localDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function requireField(value: string, label: string, field: string): string {
  if (!value) throw new ActionError(`נא למלא ${label}`, { [field]: 'שדה חובה' });
  return value;
}

/** Parse a JSON field sent by a client widget; throws a Hebrew error if malformed. */
export function jsonField<T>(fd: FormData, name: string, fallback: T): T {
  const raw = fd.get(name);
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ActionError('נתונים לא תקינים בטופס');
  }
}
