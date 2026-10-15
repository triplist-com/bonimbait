/**
 * The analytics EVENT CATALOG: every event name and its props schema.
 *
 * Rules (docs/platform/FOUNDATION.md#analytics):
 *   - Don't invent names ad hoc: add the event here first. Names are
 *     snake_case `<object>_<past-tense verb>` (search_submitted, hub_item_saved).
 *   - Props carry NO personal data: no names, phones, emails or free-form
 *     contact details. Link to rows by id instead (lead_id, business_id).
 *     Free-text fields (queries) are redacted for emails and phone numbers.
 *   - `emitter` says who may send it. POST /api/track only accepts 'client'
 *     and 'both' events, so a browser can't forge server facts (a stored lead,
 *     a revealed phone, a completed AI answer).
 *   - Strings are trimmed and truncated, never rejected for length. Unknown
 *     props are dropped. A wrong type drops the event.
 *
 * Client code imports only the TYPES from this file (lib/analytics/track.ts),
 * so zod never ships to the browser for analytics.
 */
import { z } from 'zod';
import type { LeadType } from '@/lib/db/types';
import { LEAD_TYPES } from '@/lib/leads/constants';

export type EventEmitter = 'client' | 'server' | 'both';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 9+ digits, optionally with spaces/dashes/dots and a leading +: phone-like.
const PHONE_RE = /\+?\d(?:[\s.-]?\d){8,}/g;

/** Collapse whitespace, trim, truncate. */
export function cleanText(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** cleanText + redact emails and phone-like numbers (free text typed by visitors). */
export function redactFreeText(value: string, max: number): string {
  return cleanText(value.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]'), max);
}

const text = (max: number) => z.string().transform((s) => cleanText(s, max));
const freeText = (max: number) => z.string().transform((s) => redactFreeText(s, max));
const id = z.guid();
const count = z.number().int().min(0).max(1_000_000_000);
const ratio = z.number().min(0).max(1);
const seconds = z.number().min(0).max(86_400);

function event<P extends z.ZodObject>(emitter: EventEmitter, description: string, props: P) {
  return { emitter, description, props };
}

const leadType = z.enum(LEAD_TYPES as unknown as [LeadType, ...LeadType[]]);
const leadCta = {
  cta: text(60), // what is offered: 'pros' | 'consultation' | 'budget_plan' | ...
  placement: text(60), // where: 'answer' | 'business_page' | 'hub' | ...
  specialty: text(80).optional(),
};
const partnerOffer = {
  offer_id: text(120),
  partner: text(120).optional(),
  placement: text(60).optional(),
};
/**
 * Sources cited under an answer, as '<kind>:<id>' ('video:<youtube id>',
 * 'post:<slug>', 'podcast:<id>'): the same shape as the source_clicked
 * attribution source. Malformed entries are dropped and the list is capped at
 * 8, so a bad entry never drops the event.
 */
const sourceIds = z
  .array(z.unknown())
  .transform((items) =>
    items
      .filter((v): v is string => typeof v === 'string' && /^(video|post|podcast):[^\s]{1,200}$/.test(v.trim()))
      .map((v) => v.trim().slice(0, 210))
      .slice(0, 8),
  );
const advisorTurn = {
  turn: count.optional(), // 1-based turn in a multi-turn conversation
  conversation_id: text(64).optional(),
};

export const EVENT_CATALOG = {
  // --- Navigation ----------------------------------------------------------
  page_view: event(
    'client',
    'A page was shown: first load and every client-side navigation (<PageViewTracker/> in app/layout.tsx).',
    z.object({ q: freeText(300).optional() }), // the ?q= of /search/
  ),

  // --- Search and AI answers (P1) -------------------------------------------
  search_submitted: event(
    'client',
    'A search was submitted from a search box (components/SearchBar.tsx).',
    z.object({ query: freeText(300), source: text(40).optional() }),
  ),
  answer_requested: event(
    'server',
    'An AI answer was requested (POST /api/answer/stream), before the rate-limit and budget checks.',
    z.object({ query: freeText(300), origin: text(20).optional(), ...advisorTurn }),
  ),
  answer_completed: event(
    'server',
    'An AI answer finished streaming (POST /api/answer/stream). Low confidence = a content gap: ' +
      'top_similarity is the best source cosine, n_sources the number of sources shown, refused set when the ' +
      'library had nothing close (lib/advisor/confidence.ts).',
    z.object({
      query: freeText(300),
      sources: count,
      confidence: ratio,
      latency_ms: count,
      model: text(60),
      has_pros: z.boolean().optional(),
      output_tokens: count.optional(),
      cost_usd: z.number().min(0).max(100).optional(),
      // Advisor (P1): retrieval quality and the Command Center's content-gap signals
      // ("השאלות שעוד לא עניתם עליהן", P4).
      top_similarity: z.number().min(-1).max(1).optional(), // best raw cosine among the sources fed to the answer
      n_sources: count.optional(), // sources fed to the answer (same as `sources`)
      source_ids: sourceIds.optional(), // the cited sources, in citation order
      cited: count.optional(), // distinct sources the answer cites
      refused: z.enum(['out_of_scope', 'low_confidence']).optional(),
      degraded: text(20).optional(),
      rewritten: z.boolean().optional(), // follow-up rewritten to a standalone query
      standalone_query: freeText(300).optional(),
      followups: count.optional(),
      focus: z.enum(['video', 'post']).optional(),
      origin: text(20).optional(),
      first_token_ms: count.optional(),
      ...advisorTurn,
    }),
  ),
  answer_shared: event(
    'client',
    'An advisor answer was shared (WhatsApp, copy link or the native share sheet); creates /ask/a/<id>/.',
    z.object({
      channel: z.enum(['whatsapp', 'copy', 'native']),
      share_id: text(32).optional(),
      query: freeText(300).optional(),
      ...advisorTurn,
    }),
  ),
  answer_feedback: event(
    'client',
    'A visitor rated an answer (thumbs up/down).',
    z.object({
      helpful: z.boolean(),
      query: freeText(300).optional(),
      reason: freeText(300).optional(),
      ...advisorTurn,
    }),
  ),
  followup_clicked: event(
    'client',
    'A suggested follow-up question was clicked.',
    z.object({ question: freeText(300), position: count.optional(), from_query: freeText(300).optional() }),
  ),
  source_clicked: event(
    'client',
    'A video, podcast or article source under an answer was opened.',
    z.object({
      kind: z.enum(['video', 'post', 'podcast']),
      id: text(200), // YouTube id or post slug
      position: count.optional(),
      timestamp: seconds.optional(), // seconds into the video
      query: freeText(300).optional(),
    }),
  ),

  // --- Leads (P3) -----------------------------------------------------------
  lead_cta_shown: event('client', 'A lead CTA became visible.', z.object(leadCta)),
  lead_cta_clicked: event(
    'client',
    'A lead CTA was clicked.',
    z.object({ ...leadCta, business_id: id.optional() }),
  ),
  lead_submitted: event(
    'server',
    'A lead was stored (lib/leads/submit.ts). Join on lead_id for details; never carries contact data.',
    z.object({
      lead_type: leadType,
      lead_id: id.optional(),
      lead_ref: text(20).optional(), // human-friendly id, e.g. BB-26-000123
      business_id: id.optional(),
      kind: text(40).optional(), // e.g. 'phone_reveal' | 'contact_form'
      cta_source: text(60).optional(),
      region: text(40).optional(),
      stage: text(40).optional(),
      // 4-hour last-touch attribution (lib/analytics/attribution.ts)
      touch: z.enum(['partner_click', 'source_clicked', 'page_view']).optional(),
      touch_medium: text(20).optional(),
      touch_source: text(200).optional(),
      // Revenue engine (lib/revenue): the project-file score and the routing target.
      score: z.number().int().min(0).max(100).optional(),
      routing: text(30).optional(),
    }),
  ),
  quote_request: event(
    'both',
    'A builder asked pros for a price quote.',
    z.object({
      specialty: text(80),
      stage: text(40),
      region: text(40),
      business_id: id.optional(),
      lead_id: id.optional(),
    }),
  ),
  shortlist_add: event(
    'both',
    "A pro was added to the builder's shortlist.",
    z.object({ business_id: id, specialty: text(80).optional(), source: text(60).optional() }),
  ),
  consult_booking_started: event(
    'client',
    'A visitor started booking the free consultation (Calendly: picked a date and time).',
    z.object({ source: text(60), method: z.enum(['calendly', 'callback']).optional(), lead_ref: text(20).optional() }),
  ),
  consult_booked: event(
    'both',
    'The free consultation was booked (Calendly event_scheduled; later also its webhook). lead_ref = the consultation lead.',
    z.object({ source: text(60).optional(), method: z.enum(['calendly', 'callback']).optional(), lead_ref: text(20).optional() }),
  ),
  phone_reveal: event(
    'server',
    "A pro's phone was revealed after the lead popup (app/business/[slug]/actions.ts).",
    z.object({ business_id: id, business_slug: text(200).optional() }),
  ),
  consultation_clicked: event(
    'client',
    'The free budget-consultation modal was opened (components/leads/ConsultationCTA.tsx).',
    z.object({ source: text(60), variant: text(20).optional() }),
  ),

  // --- Accounts and the builder hub (P2) ------------------------------------
  signup_started: event(
    'client',
    'The signup form was opened or started.',
    z.object({ method: z.enum(['email', 'google']).optional(), source: text(60).optional() }),
  ),
  signup_completed: event(
    'server',
    'An account was created.',
    z.object({ method: z.enum(['email', 'google']).optional(), stage: text(40).optional(), region: text(40).optional() }),
  ),
  hub_onboarding_completed: event(
    'both',
    'A builder finished the hub onboarding (project profile).',
    z.object({
      stage: text(40).optional(),
      region: text(40).optional(),
      size_sqm: z.number().min(0).max(100_000).optional(),
      budget_band: text(40).optional(),
      timeline_months: count.optional(),
    }),
  ),
  hub_item_saved: event(
    'both',
    'A builder saved an item to the hub (video, article, pro, checklist...).',
    z.object({ item_type: text(40), item_id: text(200) }),
  ),
  hub_checklist_item_done: event(
    'both',
    'A builder ticked an item on a stage checklist (ids from lib/hub/content.ts).',
    z.object({ stage: text(40), item_id: text(80) }),
  ),
  hub_task_added: event(
    'server',
    'A builder added a task in the hub (typed, or the suggested ones for the stage).',
    z.object({ stage: text(40).optional(), has_due_date: z.boolean().optional(), source: text(20).optional() }),
  ),
  hub_budget_item_added: event(
    'server',
    'A builder recorded a quote or a payment in the hub budget (never the amount).',
    z.object({ kind: z.enum(['quote', 'actual']), category: text(40), stage: text(40).optional() }),
  ),
  hub_document_uploaded: event(
    'server',
    'A builder uploaded a document to the hub (plans, permit, quote, contract, photo...).',
    z.object({ category: text(40), mime_type: text(60).optional(), size_kb: count.optional() }),
  ),

  // --- Growth (P6) ------------------------------------------------------------
  planner_started: event(
    'both',
    'The budget planner was started (first step answered).',
    z.object({ source: text(60).optional() }),
  ),
  planner_completed: event(
    'both',
    'The budget planner reached its result (funnel end). The estimate itself is budget_estimate_completed.',
    z.object({
      total_ils: count.optional(),
      size_sqm: z.number().min(0).max(100_000).optional(),
      region: text(40).optional(),
      stage: text(40).optional(),
    }),
  ),
  budget_estimate_completed: event(
    'both',
    'An estimate with a total was computed (budget planner result or the /calculator wizard).',
    z.object({
      total_ils: count.optional(), // whole shekels
      size_sqm: z.number().min(0).max(100_000).optional(),
      region: text(40).optional(),
      finish_level: text(40).optional(),
      estimate_id: text(64).optional(),
    }),
  ),
  planner_step_completed: event(
    'client',
    'A budget planner question was answered (the funnel between planner_started and planner_completed).',
    z.object({ step: count, question: text(20), source: text(60).optional() }),
  ),
  planner_shared: event(
    'client',
    'A budget planner result was shared (WhatsApp, link copy or the native share sheet).',
    z.object({
      channel: z.enum(['whatsapp', 'copy', 'native']),
      placement: text(60).optional(), // 'planner_result' | 'planner_report' | ...
      estimate_id: text(64).optional(),
    }),
  ),

  // --- Directory --------------------------------------------------------------
  pro_profile_view: event(
    'client',
    'A business profile was viewed (/business/<slug>/).',
    z.object({ business_id: id, business_slug: text(200).optional(), specialty: text(80).optional() }),
  ),
  pro_contact_clicked: event(
    'client',
    'A contact channel on a pro was clicked.',
    z.object({ business_id: id, channel: z.enum(['phone', 'whatsapp', 'form', 'website', 'email']) }),
  ),

  // --- Partners ---------------------------------------------------------------
  // Sponsored partner slots (campaign placements): the billing-grade pair.
  partner_impression: event(
    'client',
    'A sponsored partner slot was VIEWABLY seen: >=50% visible for >=1s while the visitor was active ' +
      '(input/scroll in the last 60s). Deduped per slot and visitor for 30 minutes. Sent by <ViewableImpression/>.',
    z.object({
      slot: text(120),
      partner_id: text(120),
      offer_id: text(120).optional(),
      placement: text(60).optional(),
      visible_ms: count.optional(),
    }),
  ),
  partner_click: event(
    'client',
    'A click inside a sponsored partner slot (<ViewableImpression/> records it).',
    z.object({
      slot: text(120).optional(),
      partner_id: text(120),
      offer_id: text(120).optional(),
      placement: text(60).optional(),
    }),
  ),
  // Benefits-shop offers (/הטבות-לקהילה/, product pages): not viewability-checked.
  partner_offer_view: event('client', 'A benefits-shop partner offer was shown (page or card).', z.object(partnerOffer)),
  partner_offer_click: event('client', 'A benefits-shop partner offer CTA was clicked.', z.object(partnerOffer)),

  // --- Media ------------------------------------------------------------------
  video_play: event(
    'client',
    'A video started playing.',
    z.object({ youtube_id: text(20), start: seconds.optional(), source: text(60).optional() }),
  ),
} as const;

export type EventCatalog = typeof EVENT_CATALOG;
export type EventName = keyof EventCatalog;
/** Props a caller passes (before trimming/redaction). */
export type EventProps<N extends EventName> = z.input<EventCatalog[N]['props']>;
/** Props as stored in platform_events.props. */
export type StoredEventProps<N extends EventName> = z.output<EventCatalog[N]['props']>;

export const EVENT_NAMES = Object.keys(EVENT_CATALOG) as EventName[];

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(EVENT_CATALOG, name);
}

/** May a browser send this event to POST /api/track? */
export function isClientEvent(name: EventName): boolean {
  return EVENT_CATALOG[name].emitter !== 'server';
}

export type ValidatedEvent = { name: EventName; props: Record<string, unknown> };

export type EventValidation =
  | { ok: true; event: ValidatedEvent }
  | { ok: false; error: 'unknown_event' | 'invalid_props'; detail?: string };

/** Validate one event against the catalog. Never throws. */
export function validateEvent(name: unknown, props: unknown): EventValidation {
  if (!isEventName(name)) return { ok: false, error: 'unknown_event', detail: String(name).slice(0, 64) };
  const input = props == null ? {} : props;
  const parsed = EVENT_CATALOG[name].props.safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(props)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: 'invalid_props', detail };
  }
  return { ok: true, event: { name, props: parsed.data as Record<string, unknown> } };
}
