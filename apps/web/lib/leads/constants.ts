/**
 * Lead constants shared by server code and client forms (no server imports).
 */
import type { LeadType } from '@/lib/db/types';

export const LEAD_TYPES: readonly LeadType[] = [
  'consultation',
  'contact',
  'advertise',
  'partner',
  'join_pro',
  'business_contact',
  'benefit',
  'whatsapp_join',
  'service_plan',
  'claim_business',
];

/** Hebrew labels for notifications and the Wave 3 admin. */
export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  consultation: 'ייעוץ תקציב בניה',
  contact: 'צור קשר',
  advertise: 'פרסמו אצלנו',
  partner: 'שותפים אסטרטגיים',
  join_pro: 'הצטרפות בעל מקצוע',
  business_contact: 'פנייה לבעל מקצוע',
  benefit: 'הטבה / מוצר',
  whatsapp_join: 'הצטרפות לקבוצת WhatsApp',
  service_plan: 'מסלול ניהול בנייה',
  claim_business: 'בקשת ניהול עסק',
};

/** Strategic-partners form categories (live /strategic-partners/ select). */
export const PARTNER_CATEGORIES = [
  'חימום ומיזוג',
  'חלונות ודלתות',
  'מטבחים',
  'ריצוף וחיפוי',
  'אינסטלציה',
  'חשמל',
  'גינון ופיתוח',
  'אחר',
] as const;

/**
 * Hidden form fields understood by the lead server actions. The honeypot is
 * a plausible-looking field that real visitors never see or fill.
 */
export const HONEYPOT_FIELD = 'company_website';
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/**
 * Site contact details shown on the live /צור-קשר/ page and floating CTA.
 * Emails are derived from the site host (lib/site.ts), never hard-coded.
 */
export const SITE_CONTACT = {
  officePhone: '03-9440467',
  mobilePhone: '054-4300202',
  hours: "א'-ה': 09:00-18:00",
  address: 'שושנה דמרי 30 חולון',
} as const;

/** "0XX..." / "+972..." -> tel: href digits. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
