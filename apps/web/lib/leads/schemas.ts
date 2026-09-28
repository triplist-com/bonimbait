/**
 * Per-type lead validation (zod) with Hebrew messages.
 *
 * Every live form posts flat string fields (FormData). `validateLead(type, raw)`
 * whitelists the fields each lead type accepts, normalizes them, and splits
 * them into the `leads` columns plus a type-specific `payload` (jsonb).
 *
 * Field names (the `name` attribute a form must use):
 *   full_name, phone, email, region (slug from lib/constants/community),
 *   construction_stage, message, company, category, business_name,
 *   group (whatsapp_groups.slug), not_professional, newsletter, consent.
 *
 * Pure module: safe for server and client, and unit-tested.
 */
import { z } from 'zod';
import type { ConstructionStage, Json, LeadType } from '@/lib/db/types';
import { CONSTRUCTION_STAGES, REGIONS } from '@/lib/constants/community';
import { PARTNER_CATEGORIES } from './constants';

export const MSG = {
  required: 'שדה חובה',
  tooLong: 'הטקסט ארוך מדי',
  phone: 'נא להזין מספר טלפון תקין (לפחות 9 ספרות)',
  email: 'נא להזין כתובת אימייל תקינה',
  region: 'יש לבחור אזור',
  stage: 'יש לבחור שלב בנייה',
  category: 'יש לבחור קטגוריה',
  notProfessional: 'יש לאשר שאתם בונים/משפצים פרטיים (לא בעלי מקצוע)',
  consent: 'יש לאשר את השימוש בפרטים',
} as const;

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/** Israeli-friendly phone normalization: "+972 54-430-0202" -> "0544300202". */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+972') || (digits.startsWith('972') && digits.length >= 11)) {
    digits = `0${digits.slice(3)}`;
  }
  return digits;
}

export function isValidPhone(normalized: string): boolean {
  // Local numbers: 0 + 8 digits (landline) or 0 + 9 digits (mobile);
  // anything else must look like an international number.
  return /^0\d{8,9}$/.test(normalized) || /^[1-9]\d{8,14}$/.test(normalized);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const asString = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v));
const truthy = (v: unknown) => v === true || v === 'on' || v === 'true' || v === '1' || v === 'yes';

const requiredText = (max = 200) =>
  z.preprocess(asString, z.string().trim().min(1, MSG.required).max(max, MSG.tooLong));

const optionalText = (max = 200) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, MSG.tooLong).optional());

const phoneField = z.preprocess(
  asString,
  z
    .string()
    .trim()
    .min(1, MSG.required)
    .transform(normalizePhone)
    .refine(isValidPhone, MSG.phone),
);

const emailField = z.preprocess(
  asString,
  z.string().trim().min(1, MSG.required).max(254, MSG.tooLong).toLowerCase().regex(EMAIL_RE, MSG.email),
);

const optionalEmail = z.preprocess(
  blankToUndefined,
  z.string().trim().max(254, MSG.tooLong).toLowerCase().regex(EMAIL_RE, MSG.email).optional(),
);

const REGION_SLUGS = REGIONS.map((r) => r.slug) as [string, ...string[]];
const STAGE_VALUES = CONSTRUCTION_STAGES.map((s) => s.value) as [ConstructionStage, ...ConstructionStage[]];

const regionField = (slugs: [string, ...string[]]) =>
  z.preprocess(asString, z.string().refine((v) => slugs.includes(v), MSG.region));
const optionalRegion = z.preprocess(
  blankToUndefined,
  z.string().refine((v) => REGION_SLUGS.includes(v), MSG.region).optional(),
);
const stageField = z.preprocess(
  asString,
  z.string().refine((v): v is ConstructionStage => (STAGE_VALUES as string[]).includes(v), MSG.stage),
);
const optionalStage = z.preprocess(
  blankToUndefined,
  z.string().refine((v) => (STAGE_VALUES as string[]).includes(v), MSG.stage).optional(),
);
const flag = z.preprocess(truthy, z.boolean());
const mustBeChecked = (message: string) => z.preprocess(truthy, z.literal(true, { error: message }));

const message = optionalText(5000);

// ---------------------------------------------------------------------------
// Per-type schemas
// ---------------------------------------------------------------------------

/** Normalized result: `leads` columns + type-specific payload. */
export type ParsedLead = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  regionSlug: string | null;
  constructionStage: ConstructionStage | null;
  /** whatsapp_join only: whatsapp_groups.slug to resolve server-side. */
  whatsappGroupSlug: string | null;
  payload: { [key: string]: Json };
};

type Spec<S extends z.ZodTypeAny> = { schema: S; toLead: (d: z.infer<S>) => ParsedLead };
const spec = <S extends z.ZodTypeAny>(schema: S, toLead: (d: z.infer<S>) => ParsedLead): Spec<S> => ({
  schema,
  toLead,
});

const base = (d: {
  full_name?: string;
  email?: string;
  phone?: string;
  message?: string;
  region?: string;
  construction_stage?: string;
}): Omit<ParsedLead, 'payload' | 'whatsappGroupSlug'> => ({
  fullName: d.full_name ?? null,
  email: d.email ?? null,
  phone: d.phone ?? null,
  message: d.message ?? null,
  regionSlug: d.region ?? null,
  constructionStage: (d.construction_stage as ConstructionStage | undefined) ?? null,
});

export const LEAD_SPECS = {
  /** /צור-קשר/ (CF7 #795). */
  contact: spec(
    z.object({
      full_name: requiredText(),
      phone: phoneField,
      email: emailField,
      region: regionField(REGION_SLUGS),
      message,
    }),
    (d) => ({ ...base(d), whatsappGroupSlug: null, payload: {} }),
  ),
  /** Consultation CTA fallback ("leave your number and we'll call you"). */
  consultation: spec(
    z.object({
      full_name: requiredText(),
      phone: phoneField,
      email: optionalEmail,
      region: optionalRegion,
      construction_stage: optionalStage,
      message,
    }),
    (d) => ({ ...base(d), whatsappGroupSlug: null, payload: {} }),
  ),
  /** /strategic-partners/ (partnerLeadForm). */
  partner: spec(
    z.object({
      full_name: requiredText(),
      company: requiredText(),
      phone: phoneField,
      email: optionalEmail,
      category: z.preprocess(
        asString,
        z.string().refine((v) => (PARTNER_CATEGORIES as readonly string[]).includes(v), MSG.category),
      ),
      message,
    }),
    (d) => ({
      ...base(d),
      whatsappGroupSlug: null,
      payload: { company: d.company, category: d.category },
    }),
  ),
  /** /הצטרפו-לקבוצות-הווטסאפ/ (bbwa-form). */
  whatsapp_join: spec(
    z.object({
      full_name: requiredText(),
      phone: phoneField,
      group: z.preprocess(asString, z.string().trim().min(1, MSG.region).max(64)),
      not_professional: mustBeChecked(MSG.notProfessional),
      newsletter: flag,
    }),
    (d) => ({
      ...base(d),
      whatsappGroupSlug: d.group,
      payload: { group: d.group, not_professional: true, newsletter: d.newsletter },
    }),
  ),
  /** Phone-reveal popup on /business/<slug>/ (CF7 #6). Needs businessId. */
  business_contact: spec(
    z.object({
      full_name: requiredText(),
      email: emailField,
      phone: phoneField,
      region: regionField(REGION_SLUGS),
      construction_stage: stageField,
      message,
    }),
    (d) => ({ ...base(d), whatsappGroupSlug: null, payload: {} }),
  ),
  /** Benefit/product "חזרו אליי" forms (CF7 #74386 and the product form). */
  benefit: spec(
    z.object({
      full_name: requiredText(),
      phone: phoneField,
      email: emailField,
      region: optionalRegion,
      construction_stage: optionalStage,
      consent: mustBeChecked(MSG.consent),
      message,
    }),
    (d) => ({ ...base(d), whatsappGroupSlug: null, payload: { consent: true } }),
  ),
  /** /join-us/ "פרסמו אצלנו" (CF7 #1099). */
  advertise: spec(
    z.object({
      business_name: requiredText(),
      full_name: optionalText(),
      phone: phoneField,
      email: emailField,
      region: regionField(REGION_SLUGS),
      message,
    }),
    (d) => ({
      ...base(d),
      fullName: d.full_name ?? d.business_name,
      whatsappGroupSlug: null,
      payload: { business_name: d.business_name },
    }),
  ),
  /** Join as a professional (same fields as advertise). */
  join_pro: spec(
    z.object({
      business_name: requiredText(),
      full_name: optionalText(),
      phone: phoneField,
      email: emailField,
      region: regionField(REGION_SLUGS),
      message,
    }),
    (d) => ({
      ...base(d),
      fullName: d.full_name ?? d.business_name,
      whatsappGroupSlug: null,
      payload: { business_name: d.business_name },
    }),
  ),
  /** Interest in a construction-management plan (/membership-tiers/). */
  service_plan: spec(
    z.object({
      full_name: requiredText(),
      phone: phoneField,
      email: optionalEmail,
      region: optionalRegion,
      message,
    }),
    (d) => ({ ...base(d), whatsappGroupSlug: null, payload: {} }),
  ),
} satisfies Record<LeadType, Spec<z.ZodTypeAny>>;

export type FieldErrors = Record<string, string>;

export type ValidationResult = { ok: true; lead: ParsedLead } | { ok: false; fieldErrors: FieldErrors };

/** Validate raw form values for a lead type. Unknown fields are dropped. */
export function validateLead(type: LeadType, raw: Record<string, unknown>): ValidationResult {
  const s = LEAD_SPECS[type] as Spec<z.ZodTypeAny> | undefined;
  if (!s) return { ok: false, fieldErrors: { _form: 'סוג טופס לא מוכר' } };
  const parsed = s.schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length ? String(issue.path[0]) : '_form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  return { ok: true, lead: s.toLead(parsed.data) };
}

export function isLeadType(value: unknown): value is LeadType {
  return typeof value === 'string' && value in LEAD_SPECS;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
