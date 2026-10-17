import 'server-only';

/**
 * submitLead — the single server-side entry point for every public lead form.
 *
 *   const res = await submitLead({
 *     type: 'business_contact',
 *     payload: { full_name, email, phone, region, construction_stage },
 *     sourceUrl: '/business/עודד/',
 *     businessId,                       // business_contact
 *     ip: clientIpFromHeaders(headers()),
 *     spam: { honeypot, turnstileToken },
 *   });
 *   if (res.ok) { ...reveal phone / redirect... } else { show res.fieldErrors / res.message }
 *
 * Steps: spam checks -> zod validation (lib/leads/schemas.ts) -> resolve
 * region / WhatsApp group -> service-role insert -> notifyLead() (never throws;
 * the outcome is recorded on the row). Server Actions wrapping this for forms
 * live in lib/leads/actions.ts.
 */
import type { Json, LeadRow, LeadType } from '@/lib/db/types';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import {
  countRecentLeadsByIpHash,
  getRegionBySlug,
  getWhatsappGroupBySlug,
  insertLeadTrusted,
} from '@/lib/db/leads';
import { REGIONS } from '@/lib/constants/community';
import { lastTouchForVisitor } from '@/lib/analytics/attribution';
import { currentVisitor, trackServer } from '@/lib/analytics/server';
import { prepareRevenueLead } from '@/lib/revenue/lead-pipeline';
import { validateLead, isUuid, type FieldErrors } from './schemas';
import { notifyLead, type NotifyResult } from './notify';
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MIN,
  hashIp,
  isHoneypotTripped,
  memoryRateLimited,
  verifyTurnstile,
} from './spam';
import { SITE_CONTACT } from './constants';
import { cleanSourceUrl } from './source';

export type SubmitLeadInput = {
  type: LeadType;
  /** Raw form values (see field names in lib/leads/schemas.ts). */
  payload: Record<string, unknown>;
  /** Page the form was submitted from (path or absolute URL). */
  sourceUrl?: string | null;
  businessId?: string | null;
  productId?: string | null;
  servicePlanId?: string | null;
  /** Extra non-validated context stored in payload (e.g. product_name). Keep it small. */
  context?: Record<string, string | number | boolean | null>;
  utm?: Record<string, string>;
  /** Signed-in member (profiles.id), if any. */
  memberId?: string | null;
  /** Client IP for rate limiting (hashed before storage). */
  ip?: string | null;
  spam?: { honeypot?: unknown; turnstileToken?: unknown };
  /**
   * The visitor's project file as the browser assembled it (lib/project-file,
   * untrusted). Builder leads are always enriched: this is sanitized, merged
   * with the member's hub snapshot and the form, scored, and stored in
   * payload.project_file / payload.project_score (+ leads.score).
   */
  projectFile?: unknown;
};

export type SubmitLeadError = 'validation' | 'spam' | 'rate_limited' | 'unavailable' | 'server';

export type SubmitLeadResult =
  | {
      ok: true;
      /** null when a honeypot hit was silently dropped. */
      lead: LeadRow | null;
      notification: NotifyResult | null;
    }
  | { ok: false; error: SubmitLeadError; message: string; fieldErrors?: FieldErrors };

const MESSAGES: Record<Exclude<SubmitLeadError, 'validation'>, string> = {
  spam: 'לא הצלחנו לאמת שאתם לא רובוט. נסו שוב.',
  rate_limited: 'נשלחו יותר מדי פניות בזמן קצר. נסו שוב בעוד כמה דקות.',
  unavailable: `לא ניתן לשלוח את הטופס כרגע. נסו שוב מאוחר יותר או התקשרו אלינו: ${SITE_CONTACT.officePhone}`,
  server: `אירעה שגיאה בשליחת הטופס. נסו שוב או התקשרו אלינו: ${SITE_CONTACT.officePhone}`,
};

const fail = (error: Exclude<SubmitLeadError, 'validation'>): SubmitLeadResult => ({
  ok: false,
  error,
  message: MESSAGES[error],
});

const invalid = (fieldErrors: FieldErrors): SubmitLeadResult => ({
  ok: false,
  error: 'validation',
  message: 'נא לתקן את השדות המסומנים',
  fieldErrors,
});

function cleanUtm(utm: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(utm ?? {})) {
    if (/^(utm_[a-z]+|gclid|fbclid)$/.test(k) && typeof v === 'string' && v) out[k] = v.slice(0, 200);
  }
  return out;
}

/** http(s) URLs and site paths only: staff open it as a link (lib/leads/source.ts). */
function cleanSource(src: string | null | undefined): string | null {
  return cleanSourceUrl(src);
}

export async function submitLead(input: SubmitLeadInput): Promise<SubmitLeadResult> {
  // 1. Honeypot: pretend success, store nothing.
  if (isHoneypotTripped(input.spam?.honeypot)) {
    return { ok: true, lead: null, notification: null };
  }

  // 2. Validation (cheap, before any network call).
  const validation = validateLead(input.type, input.payload);
  if (!validation.ok) return invalid(validation.fieldErrors);
  const parsed = validation.lead;

  for (const [key, value] of [
    ['businessId', input.businessId],
    ['productId', input.productId],
    ['servicePlanId', input.servicePlanId],
  ] as const) {
    if (value != null && value !== '' && !isUuid(value)) return invalid({ _form: `מזהה לא תקין (${key})` });
  }
  if (input.type === 'business_contact' && !input.businessId) return invalid({ _form: 'חסר מזהה בעל מקצוע' });

  // 3. Turnstile (only when configured).
  if (!(await verifyTurnstile(input.spam?.turnstileToken, input.ip ?? null))) return fail('spam');

  if (!isServiceRoleConfigured()) {
    console.error('[leads] SUPABASE_SERVICE_ROLE_KEY is not set: cannot store leads');
    return fail('unavailable');
  }

  try {
    const db = createAdminClient();

    // 4. Rate limit per hashed IP.
    const ipHash = hashIp(input.ip);
    if (ipHash) {
      if (memoryRateLimited(ipHash)) return fail('rate_limited');
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
      if ((await countRecentLeadsByIpHash(db, ipHash, since)) >= RATE_LIMIT_MAX) return fail('rate_limited');
    }

    // 5. Resolve lookups.
    const extra: Record<string, Json> = { ...parsed.payload };
    let regionId: string | null = null;
    if (parsed.regionSlug) {
      const region = await getRegionBySlug(db, parsed.regionSlug);
      regionId = region?.id ?? null;
      extra.region = parsed.regionSlug;
      extra.region_name = region?.name ?? REGIONS.find((r) => r.slug === parsed.regionSlug)?.name ?? null;
    }
    let whatsappGroupId: string | null = null;
    if (parsed.whatsappGroupSlug) {
      const group = await getWhatsappGroupBySlug(db, parsed.whatsappGroupSlug);
      if (!group) return invalid({ group: 'יש לבחור אזור' });
      whatsappGroupId = group.id;
      extra.group_name = group.name;
    }
    for (const [k, v] of Object.entries(input.context ?? {})) {
      if (!(k in extra)) extra[k] = typeof v === 'string' ? v.slice(0, 300) : v;
    }

    // 5b. What brought this visitor in: 4h last touch (lib/analytics/attribution.ts).
    const visitor = currentVisitor();
    const attribution = await lastTouchForVisitor(visitor.anonId);

    // 5c. Revenue engine: the project file and its score, and where the lead goes
    // (lib/revenue/lead-pipeline.ts; never throws, falls back to default routing).
    const revenue = await prepareRevenueLead({
      db,
      type: input.type,
      parsed: { regionSlug: parsed.regionSlug, constructionStage: parsed.constructionStage },
      clientFile: input.projectFile,
      memberId: input.memberId ?? null,
      businessId: input.businessId || null,
      payload: extra,
      attribution,
      visitor,
    });
    Object.assign(extra, revenue.payload);

    // 6. Insert.
    const lead = await insertLeadTrusted(db, {
      type: input.type,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone,
      message: parsed.message,
      regionId,
      constructionStage: parsed.constructionStage,
      payload: extra,
      sourceUrl: cleanSource(input.sourceUrl),
      utm: cleanUtm(input.utm),
      businessId: input.businessId || null,
      productId: input.productId || null,
      servicePlanId: input.servicePlanId || null,
      whatsappGroupId,
      memberId: input.memberId ?? null,
      ipHash,
      attribution,
    });

    // Analytics (never throws; no contact details in props).
    await trackServer(
      'lead_submitted',
      {
        lead_type: lead.type,
        lead_id: lead.id,
        lead_ref: lead.ref,
        business_id: lead.business_id ?? undefined,
        kind: typeof extra.kind === 'string' ? extra.kind : undefined,
        cta_source: typeof extra.cta_source === 'string' ? extra.cta_source : undefined,
        region: parsed.regionSlug ?? undefined,
        stage: parsed.constructionStage ?? undefined,
        touch: attribution?.touch,
        touch_medium: attribution?.medium,
        touch_source: attribution?.source ?? undefined,
        score: revenue.envelope?.score.score,
        routing: revenue.decision.target,
      },
      { ip: input.ip, userId: input.memberId, path: input.sourceUrl },
    );

    // 7. Notify (never throws; bounded by per-channel timeouts), as the routing rules decided.
    const notification = await notifyLead(lead, { db, route: revenue.route });
    return { ok: true, lead, notification };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[leads] submitLead(${input.type}) failed: ${msg}`);
    // FK violation on businessId/productId/servicePlanId = bad hidden input.
    if (/foreign key/i.test(msg)) return invalid({ _form: 'הפריט שביקשתם לא נמצא' });
    return fail('server');
  }
}
