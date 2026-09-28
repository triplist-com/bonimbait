/**
 * Hebrew labels and badge tones for admin statuses. Client-safe.
 */
import type {
  BusinessStatus,
  ContentStatus,
  LeadNotifyStatus,
  LeadStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  ReviewStatus,
  Role,
} from '@/lib/db/types';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

export type StatusInfo = { label: string; tone: Tone };

export const CONTENT_STATUS: Record<ContentStatus | 'scheduled', StatusInfo> = {
  draft: { label: 'טיוטה', tone: 'gray' },
  pending: { label: 'ממתין לאישור', tone: 'amber' },
  published: { label: 'פורסם', tone: 'green' },
  scheduled: { label: 'מתוזמן', tone: 'blue' },
  archived: { label: 'בארכיון', tone: 'red' },
};

/** A published row with a future date is "scheduled" (RLS hides it until then). */
export function contentStatusKey(status: ContentStatus, publishedAt: string | null): ContentStatus | 'scheduled' {
  if (status === 'published' && publishedAt && new Date(publishedAt).getTime() > Date.now()) return 'scheduled';
  return status;
}

export const BUSINESS_STATUS: Record<BusinessStatus, StatusInfo> = {
  draft: { label: 'טיוטה', tone: 'gray' },
  pending: { label: 'ממתין לאישור', tone: 'amber' },
  published: { label: 'מפורסם', tone: 'green' },
  suspended: { label: 'מושהה', tone: 'red' },
};

export const REVIEW_STATUS: Record<ReviewStatus, StatusInfo> = {
  pending: { label: 'ממתינה', tone: 'amber' },
  approved: { label: 'מאושרת', tone: 'green' },
  rejected: { label: 'נדחתה', tone: 'red' },
};

export const PRODUCT_STATUS: Record<ProductStatus, StatusInfo> = {
  draft: { label: 'טיוטה', tone: 'gray' },
  published: { label: 'פורסם', tone: 'green' },
  archived: { label: 'בארכיון', tone: 'red' },
};

export const ORDER_STATUS: Record<OrderStatus, StatusInfo> = {
  pending: { label: 'ממתינה לתשלום', tone: 'amber' },
  paid: { label: 'שולמה', tone: 'green' },
  failed: { label: 'התשלום נכשל', tone: 'red' },
  cancelled: { label: 'בוטלה', tone: 'gray' },
  refunded: { label: 'זוכתה', tone: 'purple' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusInfo> = {
  pending: { label: 'ממתין', tone: 'amber' },
  succeeded: { label: 'הצליח', tone: 'green' },
  failed: { label: 'נכשל', tone: 'red' },
  cancelled: { label: 'בוטל', tone: 'gray' },
  refunded: { label: 'זוכה', tone: 'purple' },
};

/** Workflow statuses in order; legacy DB values map onto them. */
export const LEAD_STATUS_ORDER = ['new', 'contacted', 'won', 'lost', 'spam'] as const;

export const LEAD_STATUS: Record<LeadStatus, StatusInfo> = {
  new: { label: 'חדש', tone: 'blue' },
  contacted: { label: 'נוצר קשר', tone: 'amber' },
  won: { label: 'נסגר בהצלחה', tone: 'green' },
  lost: { label: 'לא רלוונטי', tone: 'gray' },
  spam: { label: 'ספאם', tone: 'red' },
  in_progress: { label: 'נוצר קשר', tone: 'amber' },
  qualified: { label: 'נסגר בהצלחה', tone: 'green' },
  closed: { label: 'לא רלוונטי', tone: 'gray' },
};

export const NOTIFY_STATUS: Record<LeadNotifyStatus, StatusInfo> = {
  pending: { label: 'ממתין לשליחה', tone: 'amber' },
  sent: { label: 'נשלח', tone: 'green' },
  partial: { label: 'נשלח חלקית', tone: 'amber' },
  failed: { label: 'השליחה נכשלה', tone: 'red' },
  logged: { label: 'נרשם בלוג (אין ערוץ)', tone: 'gray' },
};

export const ROLE_LABELS: Record<Role, string> = {
  member: 'חבר קהילה',
  pro: 'בעל מקצוע',
  editor: 'עורך תוכן',
  admin: 'מנהל',
};

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

export function formatAgorotPlain(agorot: number | null | undefined): string {
  if (agorot === null || agorot === undefined) return '';
  return (agorot / 100).toFixed(agorot % 100 === 0 ? 0 : 2);
}
