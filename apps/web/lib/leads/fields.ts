/**
 * Ready-made LeadForm field sets matching the live forms
 * (docs/LIVE_SITE_INVENTORY.md "Forms"). Client-safe.
 */
import { CONSTRUCTION_STAGES, MEMBER_REGIONS, REGIONS } from '@/lib/constants/community';
import { PARTNER_CATEGORIES } from './constants';
import type { LeadField, LeadFieldOption } from './types';

export const REGION_OPTIONS: readonly LeadFieldOption[] = REGIONS.map((r) => ({ value: r.slug, label: r.name }));
export const MEMBER_REGION_OPTIONS: readonly LeadFieldOption[] = MEMBER_REGIONS.map((r) => ({ value: r.slug, label: r.name }));
export const STAGE_OPTIONS: readonly LeadFieldOption[] = CONSTRUCTION_STAGES.map((s) => ({ value: s.value, label: s.label }));

const fullName: LeadField = { name: 'full_name', label: 'שם מלא', type: 'text', required: true, width: 'half' };
const phone: LeadField = { name: 'phone', label: 'טלפון', type: 'tel', required: true, width: 'half' };
const email: LeadField = { name: 'email', label: 'כתובת דוא״ל', type: 'email', required: true, width: 'half' };

/** /צור-קשר/ (CF7 #795). */
export const CONTACT_FIELDS: readonly LeadField[] = [
  fullName,
  phone,
  email,
  { name: 'region', label: 'בחר מיקום פרוייקט', type: 'select', required: true, options: REGION_OPTIONS, placeholder: 'בחר מיקום פרוייקט', width: 'half' },
  { name: 'message', label: 'תיאור הבקשה שלכם', type: 'textarea', rows: 4 },
];

/** Consultation CTA fallback ("השאירו מספר ונחזור אליכם"). */
export const CONSULTATION_FIELDS: readonly LeadField[] = [
  fullName,
  phone,
  { name: 'region', label: 'אזור בנייה', type: 'select', options: MEMBER_REGION_OPTIONS, placeholder: 'בחרו אזור', width: 'half' },
  { name: 'construction_stage', label: 'שלב בנייה', type: 'select', options: STAGE_OPTIONS, placeholder: 'בחרו שלב', width: 'half' },
];

/** /strategic-partners/ (partnerLeadForm). */
export const PARTNER_FIELDS: readonly LeadField[] = [
  fullName,
  { name: 'company', label: 'שם חברה', type: 'text', required: true, width: 'half', autoComplete: 'organization' },
  phone,
  {
    name: 'category',
    label: 'קטגוריה/תחום',
    type: 'select',
    required: true,
    placeholder: 'קטגוריה/תחום',
    options: PARTNER_CATEGORIES.map((c) => ({ value: c, label: c })),
    width: 'half',
  },
];

/** Phone-reveal popup on /business/<slug>/ (CF7 #6). Pass businessId to LeadForm. */
export const BUSINESS_CONTACT_FIELDS: readonly LeadField[] = [
  fullName,
  { ...email, label: 'אימייל' },
  { ...phone, label: 'נייד' },
  { name: 'region', label: 'בחר מיקום פרוייקט', type: 'select', required: true, options: REGION_OPTIONS, placeholder: 'בחר מיקום פרוייקט', width: 'half' },
  { name: 'construction_stage', label: 'שלב הבניה שלך', type: 'select', required: true, options: STAGE_OPTIONS, placeholder: 'שלב הבניה שלך' },
];

/** Benefit/product "חזרו אליי" (CF7 #74386). Pass productId to LeadForm. */
export const BENEFIT_FIELDS: readonly LeadField[] = [
  fullName,
  phone,
  email,
  { name: 'region', label: 'בחר מיקום פרוייקט', type: 'select', options: MEMBER_REGION_OPTIONS, placeholder: 'בחר מיקום פרוייקט', width: 'half' },
  { name: 'construction_stage', label: 'בחר שלב בניה', type: 'select', options: STAGE_OPTIONS, placeholder: 'בחר שלב בניה' },
  {
    name: 'consent',
    label: 'מאשר/ת את השימוש במידע אודותיי לצורך יצירת קשר ומימוש ההטבה',
    type: 'checkbox',
    required: true,
    requiredMessage: 'יש לאשר את השימוש בפרטים',
  },
];

/** /join-us/ "פרסמו אצלנו" (CF7 #1099); use type 'advertise' or 'join_pro'. */
export const ADVERTISE_FIELDS: readonly LeadField[] = [
  { name: 'business_name', label: 'שם העסק', type: 'text', required: true, width: 'half', autoComplete: 'organization' },
  phone,
  email,
  { name: 'region', label: 'מיקומי עבודה', type: 'select', required: true, options: REGION_OPTIONS, placeholder: 'מיקומי עבודה', width: 'half' },
  { name: 'message', label: 'ספרו לנו על העסק בכמה מילים', type: 'textarea', rows: 4 },
];

/** WhatsApp join (bbwa-form). `groups` come from whatsapp_groups_public. */
export function whatsappJoinFields(groups: ReadonlyArray<{ slug: string; name: string }>): LeadField[] {
  return [
    { name: 'full_name', label: 'שם מלא', type: 'text', required: true, requiredMessage: 'יש להזין שם מלא' },
    { name: 'phone', label: 'WhatsApp', type: 'tel', required: true, requiredMessage: 'יש להזין מספר טלפון', placeholder: '050-0000000' },
    {
      name: 'group',
      label: 'אזור בנייה',
      type: 'select',
      required: true,
      requiredMessage: 'יש לבחור אזור',
      placeholder: 'בחרו אזור',
      options: groups.map((g) => ({ value: g.slug, label: g.name })),
    },
    {
      name: 'not_professional',
      label: 'אני מאשר/ת שאני בונה או משפץ פרטי ולא בעל מקצוע בתחום',
      type: 'checkbox',
      required: true,
      requiredMessage: 'יש לאשר שאתם בונים/משפצים פרטיים (לא בעלי מקצוע)',
    },
    { name: 'newsletter', label: 'אשמח לקבל טיפים ועדכונים רלוונטיים', type: 'checkbox', defaultChecked: true },
  ];
}
