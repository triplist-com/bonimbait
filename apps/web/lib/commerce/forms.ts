/**
 * Form vocabularies and validation shared by the commerce lead forms,
 * checkout and the account profile. Pure; safe on client and server.
 */
import type { ConstructionStage } from '@/lib/db/types';
import { MEMBER_REGIONS, isConstructionStage } from '@/lib/constants/community';

/** The 7 stages offered on the live product lead form, in live order. */
export const LEAD_STAGES: ReadonlyArray<{ value: ConstructionStage; label: string }> = [
  { value: 'land', label: 'רכישת מגרש' },
  { value: 'planning', label: 'תכנון' },
  { value: 'frame', label: 'שלד' },
  { value: 'tender', label: 'מכרז קבלנים' },
  { value: 'finishing', label: 'גמרים' },
  { value: 'moving_in', label: 'כניסה לבית' },
  { value: 'renovation', label: 'שיפוץ' },
];

export { MEMBER_REGIONS };

export type FieldErrors = Partial<Record<string, string>>;

/** State returned by form server actions (useFormState). */
export type FormState = { ok: boolean; message: string | null; errors: FieldErrors };
export const INITIAL_FORM_STATE: FormState = { ok: false, message: null, errors: {} };

export function str(form: FormData, key: string, max = 500): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === 'on' || v === 'true' || v === '1';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** Israeli phone: 9-10 digits after stripping separators; +972 prefix allowed. */
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+972')) digits = `0${digits.slice(4)}`;
  if (!/^\d{9,10}$/.test(digits)) return null;
  return digits;
}

export function isMemberRegionSlug(value: string): boolean {
  return MEMBER_REGIONS.some((r) => r.slug === value);
}

export function asStage(value: string): ConstructionStage | null {
  return isConstructionStage(value) ? value : null;
}

/** Common contact fields: full name, phone, email. Adds messages to `errors`. */
export function validateContact(form: FormData, errors: FieldErrors) {
  const fullName = str(form, 'full_name', 120);
  const email = str(form, 'email', 200).toLowerCase();
  const phoneRaw = str(form, 'phone', 40);
  const phone = normalizePhone(phoneRaw);
  if (fullName.length < 2) errors.full_name = 'נא למלא שם מלא';
  if (!phone) errors.phone = 'נא להזין מספר טלפון תקין (לפחות 9 ספרות)';
  if (!isValidEmail(email)) errors.email = 'נא להזין כתובת אימייל תקינה';
  return { fullName, email, phone };
}
