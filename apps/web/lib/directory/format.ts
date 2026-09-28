/**
 * Display helpers for the professionals directory. Safe for server and client.
 */

/** Israeli phone validation: 0XXXXXXXXX (9–10 digits) or +972 / 972 prefix. Returns digits "05..." or null. */
export function normalizeIsraeliPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+972')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  digits = digits.replace(/\D/g, '');
  // Live form rule: "נא להזין מינימום 10 ספרות" for mobiles; landlines have 9.
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

export function isValidEmail(input: string | null | undefined): boolean {
  return !!input && input.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

/** wa.me link from a stored whatsapp value (link or number) or a phone number. */
export function whatsappLink(whatsapp: string | null, phone: string | null): string | null {
  if (whatsapp && /^https?:\/\//i.test(whatsapp)) return whatsapp;
  const source = whatsapp || phone;
  if (!source) return null;
  let digits = source.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return digits.length >= 11 ? `https://wa.me/${digits}` : null;
}

/** tel: href */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** 0–10 score -> "9.5" (one decimal, trailing .0 dropped). */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function reviewCountLabel(count: number): string {
  return count === 1 ? 'חוות דעת אחת' : `${count} חוות דעת`;
}

const HE_DATE = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });

export function formatHebrewDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : HE_DATE.format(d);
}

/** Decode a route param (Next may hand Hebrew slugs percent-encoded) and NFC-normalize it. */
export function decodeSlug(param: string): string {
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    // Malformed escape: keep as given.
  }
  return decoded.normalize('NFC');
}

/** Path of a business profile (stored slugs are decoded; absoluteUrl() encodes). */
export function businessPath(slug: string): string {
  return `/business/${slug}/`;
}

/** Same as businessPath but percent-encoded, for <a href>. */
export function businessHref(slug: string): string {
  return `/business/${encodeURIComponent(slug)}/`;
}
