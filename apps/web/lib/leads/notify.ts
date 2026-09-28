/**
 * Pluggable lead notifier (replaces the live site's CF7 mail + Zapier hook).
 *
 * Channels (each enabled by env; all that are configured run in parallel):
 *   - email    Resend REST API        RESEND_API_KEY + LEAD_NOTIFY_EMAIL
 *                                      (LEAD_NOTIFY_FROM optional sender)
 *   - webhook  generic JSON POST       LEAD_WEBHOOK_URL (LEAD_WEBHOOK_SECRET
 *                                      optional: HMAC-SHA256 signature header)
 *   - log      console fallback when neither is configured
 *
 * Routing: a `business_contact` lead whose business has lead_routing='direct'
 * and a lead_email goes to that email; everything else goes to the site inbox
 * (LEAD_NOTIFY_EMAIL, comma-separated allowed). The webhook always receives
 * every lead, with the routing decision in the body.
 *
 * notifyLead() NEVER throws: failures are recorded on the lead
 * (notify_status / notify_channels / notify_error / notified_at / forwarded_to).
 */
import { createHmac } from 'node:crypto';
import type { Json, LeadNotifyStatus, LeadRow } from '@/lib/db/types';
import type { DbClient } from '@/lib/db/client';
import { getLeadRoutingTarget, recordLeadNotification, type LeadRoutingTarget } from '@/lib/db/leads';
import { SITE_HOST, SITE_NAME, SITE_URL } from '@/lib/site';
import { LEAD_TYPE_LABELS } from './constants';

export type NotifyEnv = {
  RESEND_API_KEY?: string;
  LEAD_NOTIFY_EMAIL?: string;
  LEAD_NOTIFY_FROM?: string;
  LEAD_WEBHOOK_URL?: string;
  LEAD_WEBHOOK_SECRET?: string;
};

export type Recipient = { to: string[]; routedTo: 'business' | 'site' };

export type ChannelResult = { ok: boolean; skipped?: boolean; error?: string; status?: number; to?: string[] };

export type NotifyResult = {
  status: LeadNotifyStatus;
  forwardedTo: string | null;
  channels: { email?: ChannelResult; webhook?: ChannelResult; log?: ChannelResult };
  error: string | null;
};

const TIMEOUT_MS = 5000;

function splitEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

function readEnv(): NotifyEnv {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    LEAD_NOTIFY_EMAIL: process.env.LEAD_NOTIFY_EMAIL,
    LEAD_NOTIFY_FROM: process.env.LEAD_NOTIFY_FROM,
    LEAD_WEBHOOK_URL: process.env.LEAD_WEBHOOK_URL,
    LEAD_WEBHOOK_SECRET: process.env.LEAD_WEBHOOK_SECRET,
  };
}

/**
 * Who should receive the email for this lead. Direct routing only applies to
 * business_contact leads of a 'direct' business that has a lead_email;
 * otherwise (or when the business email is missing) the site inbox gets it.
 */
export function resolveRecipient(
  lead: Pick<LeadRow, 'type' | 'business_id'>,
  business: Pick<LeadRoutingTarget, 'leadRouting' | 'leadEmail'> | null,
  siteInbox: string | undefined,
): Recipient {
  if (
    lead.type === 'business_contact' &&
    lead.business_id &&
    business?.leadRouting === 'direct' &&
    business.leadEmail &&
    business.leadEmail.includes('@')
  ) {
    return { to: [business.leadEmail.trim()], routedTo: 'business' };
  }
  return { to: splitEmails(siteInbox), routedTo: 'site' };
}

export type NotificationPlan = {
  recipient: Recipient;
  email: { to: string[]; from: string; subject: string; html: string; text: string } | null;
  webhook: { url: string; secret: string | null } | null;
};

/** Pure: decide which channels run and what they send. */
export function planNotification(
  lead: LeadRow,
  business: LeadRoutingTarget | null,
  env: NotifyEnv,
): NotificationPlan {
  const recipient = resolveRecipient(lead, business, env.LEAD_NOTIFY_EMAIL);
  const emailEnabled = Boolean(env.RESEND_API_KEY) && recipient.to.length > 0;
  const rows = describeLead(lead, business);
  const typeLabel = LEAD_TYPE_LABELS[lead.type] ?? lead.type;
  const subject = `ליד חדש: ${typeLabel}${lead.full_name ? ` – ${lead.full_name}` : ''}`;
  return {
    recipient,
    email: emailEnabled
      ? {
          to: recipient.to,
          from: env.LEAD_NOTIFY_FROM || `${SITE_NAME} <leads@${SITE_HOST}>`,
          subject,
          html: renderEmailHtml(subject, rows),
          text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
        }
      : null,
    webhook: env.LEAD_WEBHOOK_URL ? { url: env.LEAD_WEBHOOK_URL, secret: env.LEAD_WEBHOOK_SECRET || null } : null,
  };
}

const PAYLOAD_LABELS: Record<string, string> = {
  region_name: 'אזור',
  group_name: 'קבוצת WhatsApp',
  company: 'שם חברה',
  category: 'קטגוריה/תחום',
  business_name: 'שם העסק',
  newsletter: 'מעוניין/ת בעדכונים',
  not_professional: 'בונה/משפץ פרטי',
  consent: 'אישור שימוש בפרטים',
  product_name: 'מוצר',
  plan_name: 'מסלול',
};

/** Label/value rows for the email body. */
export function describeLead(lead: LeadRow, business: LeadRoutingTarget | null): Array<[string, string]> {
  const rows: Array<[string, string]> = [['סוג פנייה', LEAD_TYPE_LABELS[lead.type] ?? lead.type]];
  if (lead.full_name) rows.push(['שם', lead.full_name]);
  if (lead.phone) rows.push(['טלפון', lead.phone]);
  if (lead.email) rows.push(['אימייל', lead.email]);
  const payload = (lead.payload && typeof lead.payload === 'object' && !Array.isArray(lead.payload)
    ? lead.payload
    : {}) as Record<string, Json>;
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined || key === 'group' || key === 'region') continue;
    const label = PAYLOAD_LABELS[key] ?? key;
    rows.push([label, typeof value === 'boolean' ? (value ? 'כן' : 'לא') : String(value)]);
  }
  if (lead.construction_stage) rows.push(['שלב בנייה', lead.construction_stage]);
  if (business) rows.push(['בעל מקצוע', `${business.businessName} (${SITE_URL}/business/${business.businessSlug}/)`]);
  if (lead.message) rows.push(['הודעה', lead.message]);
  if (lead.source_url) rows.push(['עמוד מקור', lead.source_url]);
  rows.push(['מזהה ליד', lead.id]);
  rows.push(['התקבל', lead.created_at]);
  return rows;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderEmailHtml(title: string, rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:right;padding:6px 10px;background:#f3f4f6;white-space:nowrap">${escapeHtml(k)}</th>` +
        `<td style="padding:6px 10px;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  return (
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#111827">` +
    `<h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>` +
    `<table style="border-collapse:collapse;border:1px solid #e5e7eb">${body}</table></div>`
  );
}

/** Body sent to LEAD_WEBHOOK_URL (stable contract for Zapier/Make). */
export function webhookBody(lead: LeadRow, business: LeadRoutingTarget | null, recipient: Recipient) {
  // Never forward the hashed IP or internal workflow notes.
  const { ip_hash: _ip, notes: _notes, notify_channels: _c, notify_error: _e, ...publicLead } = lead;
  void _ip;
  void _notes;
  void _c;
  void _e;
  return {
    event: 'lead.created',
    site: SITE_URL,
    type_label: LEAD_TYPE_LABELS[lead.type] ?? lead.type,
    routed_to: recipient.routedTo,
    forward_to: recipient.to,
    business: business ? { id: business.businessId, name: business.businessName, slug: business.businessSlug } : null,
    lead: publicLead,
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail(plan: NonNullable<NotificationPlan['email']>, apiKey: string, fetchImpl: FetchLike) {
  return withTimeout(async (signal) => {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: plan.from, to: plan.to, subject: plan.subject, html: plan.html, text: plan.text }),
      signal,
    });
    if (!res.ok) throw Object.assign(new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: res.status });
    return res.status;
  });
}

async function sendWebhook(
  hook: NonNullable<NotificationPlan['webhook']>,
  body: unknown,
  fetchImpl: FetchLike,
) {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': `${SITE_NAME} leads` };
  if (hook.secret) headers['X-Bonimbait-Signature'] = `sha256=${createHmac('sha256', hook.secret).update(json).digest('hex')}`;
  return withTimeout(async (signal) => {
    const res = await fetchImpl(hook.url, { method: 'POST', headers, body: json, signal });
    if (!res.ok) throw Object.assign(new Error(`webhook ${res.status}`), { status: res.status });
    return res.status;
  });
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.name === 'AbortError' ? 'timeout' : e.message;
  return String(e);
}

/** Combine channel outcomes into one status. */
export function summarize(channels: NotifyResult['channels']): LeadNotifyStatus {
  const active = [channels.email, channels.webhook].filter((c): c is ChannelResult => Boolean(c && !c.skipped));
  if (active.length === 0) return 'logged';
  const ok = active.filter((c) => c.ok).length;
  if (ok === active.length) return 'sent';
  return ok > 0 ? 'partial' : 'failed';
}

export type NotifyOptions = {
  /** Service-role client: loads business routing and records the result. */
  db?: DbClient | null;
  env?: NotifyEnv;
  fetchImpl?: FetchLike;
  /** Pre-loaded routing target (skips the DB lookup). */
  business?: LeadRoutingTarget | null;
  logger?: Pick<Console, 'info' | 'error'>;
};

/** Notify about a stored lead. Never throws. */
export async function notifyLead(lead: LeadRow, opts: NotifyOptions = {}): Promise<NotifyResult> {
  const env = opts.env ?? readEnv();
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const logger = opts.logger ?? console;
  let result: NotifyResult = { status: 'failed', forwardedTo: null, channels: {}, error: null };

  try {
    let business = opts.business ?? null;
    if (business === null && opts.business === undefined && lead.business_id && opts.db) {
      business = await getLeadRoutingTarget(opts.db, lead.business_id).catch(() => null);
    }
    const plan = planNotification(lead, business, env);
    const [email, webhook] = await Promise.allSettled([
      plan.email ? sendEmail(plan.email, env.RESEND_API_KEY!, fetchImpl) : Promise.resolve(null),
      plan.webhook ? sendWebhook(plan.webhook, webhookBody(lead, business, plan.recipient), fetchImpl) : Promise.resolve(null),
    ]);

    const channels: NotifyResult['channels'] = {};
    if (plan.email) {
      channels.email =
        email.status === 'fulfilled'
          ? { ok: true, status: email.value ?? undefined, to: plan.email.to }
          : { ok: false, error: errorMessage(email.reason), to: plan.email.to };
    }
    if (plan.webhook) {
      channels.webhook =
        webhook.status === 'fulfilled'
          ? { ok: true, status: webhook.value ?? undefined }
          : { ok: false, error: errorMessage(webhook.reason) };
    }
    if (!plan.email && !plan.webhook) {
      logger.info(
        `[leads] ${lead.type} lead ${lead.id} (no notifier configured; set RESEND_API_KEY+LEAD_NOTIFY_EMAIL or LEAD_WEBHOOK_URL)`,
      );
      channels.log = { ok: true };
    }

    const errors = [channels.email, channels.webhook]
      .filter((c): c is ChannelResult => Boolean(c && !c.ok))
      .map((c) => c.error ?? 'error');
    result = {
      status: summarize(channels),
      forwardedTo: plan.recipient.to.join(', ') || null,
      channels,
      error: errors.length ? errors.join('; ').slice(0, 1000) : null,
    };
    if (result.error) logger.error(`[leads] notification problem for lead ${lead.id}: ${result.error}`);
  } catch (e) {
    result = { status: 'failed', forwardedTo: null, channels: {}, error: errorMessage(e).slice(0, 1000) };
    logger.error(`[leads] notifier crashed for lead ${lead.id}: ${result.error}`);
  }

  if (opts.db) {
    try {
      await recordLeadNotification(opts.db, lead.id, {
        status: result.status,
        channels: result.channels as unknown as Json,
        error: result.error,
        forwardedTo: result.forwardedTo,
      });
    } catch (e) {
      logger.error(`[leads] could not record notification status for lead ${lead.id}: ${errorMessage(e)}`);
    }
  }
  return result;
}
