/**
 * The pitch site's contact CTA, configured by env only (never committed):
 *
 *   NEXT_PUBLIC_PITCH_CONTACT_WHATSAPP  phone, any format ("050-123-4567", "+972 50 123 4567")
 *   NEXT_PUBLIC_PITCH_CONTACT_EMAIL     email address
 *   NEXT_PUBLIC_PITCH_CONTACT_NAME      optional first name for the button ("דברו עם …")
 *
 * Each channel is hidden when its variable is unset or invalid. Pure.
 */

export interface PitchContact {
  name: string | null;
  whatsapp: { href: string; display: string } | null;
  email: { href: string; display: string } | null;
}

export const PITCH_WHATSAPP_MESSAGE = 'שלום, ראיתי את בונים בית OS ואשמח לקבוע שיחה.';
export const PITCH_EMAIL_SUBJECT = 'בונים בית OS';

/** International digits for wa.me: "050-123-4567" -> "972501234567"; null when it isn't a phone. */
export function whatsAppDigits(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, '');
  if (raw.trim().startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

export function pitchContact(
  env: { whatsapp?: string; email?: string; name?: string } = {
    whatsapp: process.env.NEXT_PUBLIC_PITCH_CONTACT_WHATSAPP,
    email: process.env.NEXT_PUBLIC_PITCH_CONTACT_EMAIL,
    name: process.env.NEXT_PUBLIC_PITCH_CONTACT_NAME,
  },
): PitchContact {
  const digits = whatsAppDigits(env.whatsapp);
  const email = env.email?.trim();
  const name = env.name?.trim();
  return {
    name: name || null,
    whatsapp: digits
      ? { href: `https://wa.me/${digits}?text=${encodeURIComponent(PITCH_WHATSAPP_MESSAGE)}`, display: `+${digits}` }
      : null,
    email:
      email && EMAIL_RE.test(email)
        ? { href: `mailto:${email}?subject=${encodeURIComponent(PITCH_EMAIL_SUBJECT)}`, display: email }
        : null,
  };
}

export function hasContact(contact: PitchContact): boolean {
  return Boolean(contact.whatsapp || contact.email);
}
