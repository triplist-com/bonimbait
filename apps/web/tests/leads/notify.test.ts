import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { LeadRow } from '@/lib/db/types';
import { notifyLead, planNotification, resolveRecipient, summarize } from '@/lib/leads/notify';
import type { LeadRoutingTarget } from '@/lib/db/leads';

const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  type: 'contact',
  status: 'new',
  full_name: 'ישראל <script>',
  email: 'a@b.co',
  phone: '0501234567',
  message: 'שלום',
  region_id: null,
  construction_stage: null,
  payload: { region_name: 'מרכז' },
  source_url: '/צור-קשר/',
  utm: {},
  business_id: null,
  product_id: null,
  service_plan_id: null,
  whatsapp_group_id: null,
  member_id: null,
  assigned_to: null,
  forwarded_to: null,
  notes: null,
  notify_status: 'pending',
  notify_channels: {},
  notify_error: null,
  notified_at: null,
  ip_hash: 'secret-hash',
  created_at: '2026-09-28T10:00:00Z',
  updated_at: '2026-09-28T10:00:00Z',
  ...over,
});

const direct: LeadRoutingTarget = {
  businessId: '00000000-0000-4000-8000-0000000000b1',
  businessName: 'עודד',
  businessSlug: 'עודד',
  leadRouting: 'direct',
  leadEmail: 'oded@pro.co',
};

const silent = { info: vi.fn(), error: vi.fn() };

describe('resolveRecipient', () => {
  it('routes direct business_contact leads to the business lead_email', () => {
    const r = resolveRecipient({ type: 'business_contact', business_id: direct.businessId }, direct, 'info@site.co');
    expect(r).toEqual({ to: ['oded@pro.co'], routedTo: 'business' });
  });

  it('routes site-routed businesses to the site inbox', () => {
    const r = resolveRecipient(
      { type: 'business_contact', business_id: direct.businessId },
      { ...direct, leadRouting: 'site' },
      'info@site.co, ops@site.co',
    );
    expect(r).toEqual({ to: ['info@site.co', 'ops@site.co'], routedTo: 'site' });
  });

  it('falls back to the site inbox when a direct business has no lead_email', () => {
    const r = resolveRecipient(
      { type: 'business_contact', business_id: direct.businessId },
      { ...direct, leadEmail: null },
      'info@site.co',
    );
    expect(r.routedTo).toBe('site');
  });

  it('never routes other lead types to a business', () => {
    const r = resolveRecipient({ type: 'contact', business_id: direct.businessId }, direct, 'info@site.co');
    expect(r).toEqual({ to: ['info@site.co'], routedTo: 'site' });
  });
});

describe('planNotification', () => {
  it('enables email only with an API key and a recipient', () => {
    expect(planNotification(lead(), null, { LEAD_NOTIFY_EMAIL: 'info@site.co' }).email).toBeNull();
    expect(planNotification(lead(), null, { RESEND_API_KEY: 'k' }).email).toBeNull();
    const p = planNotification(lead(), null, { RESEND_API_KEY: 'k', LEAD_NOTIFY_EMAIL: 'info@site.co' });
    expect(p.email?.to).toEqual(['info@site.co']);
    expect(p.email?.subject).toContain('צור קשר');
    // HTML is escaped.
    expect(p.email?.html).toContain('&lt;script&gt;');
    expect(p.email?.html).not.toContain('<script>');
  });

  it('enables the webhook when LEAD_WEBHOOK_URL is set', () => {
    expect(planNotification(lead(), null, {}).webhook).toBeNull();
    expect(planNotification(lead(), null, { LEAD_WEBHOOK_URL: 'https://hook' }).webhook?.url).toBe('https://hook');
  });
});

describe('summarize', () => {
  it('combines channel outcomes', () => {
    expect(summarize({ log: { ok: true } })).toBe('logged');
    expect(summarize({ email: { ok: true }, webhook: { ok: true } })).toBe('sent');
    expect(summarize({ email: { ok: true }, webhook: { ok: false } })).toBe('partial');
    expect(summarize({ email: { ok: false } })).toBe('failed');
  });
});

describe('notifyLead', () => {
  it('logs when nothing is configured', async () => {
    const r = await notifyLead(lead(), { env: {}, logger: silent, business: null });
    expect(r.status).toBe('logged');
    expect(r.channels.log?.ok).toBe(true);
  });

  it('sends email + signed webhook and reports sent', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    });
    const r = await notifyLead(lead(), {
      env: {
        RESEND_API_KEY: 'k',
        LEAD_NOTIFY_EMAIL: 'info@site.co',
        LEAD_WEBHOOK_URL: 'https://hook.example/x',
        LEAD_WEBHOOK_SECRET: 's3cret',
      },
      fetchImpl,
      logger: silent,
      business: null,
    });
    expect(r.status).toBe('sent');
    expect(r.forwardedTo).toBe('info@site.co');
    const hook = calls.find((c) => c.url === 'https://hook.example/x')!;
    const body = String(hook.init?.body);
    const sig = (hook.init?.headers as Record<string, string>)['X-Bonimbait-Signature'];
    expect(sig).toBe(`sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`);
    const parsed = JSON.parse(body);
    expect(parsed.event).toBe('lead.created');
    expect(parsed.lead.ip_hash).toBeUndefined();
    expect(parsed.lead.full_name).toBe('ישראל <script>');
  });

  it('never throws: a failing channel yields partial/failed with the error recorded', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('resend') ? new Response('bad key', { status: 401 }) : new Response('ok', { status: 200 }),
    );
    const r = await notifyLead(lead(), {
      env: { RESEND_API_KEY: 'k', LEAD_NOTIFY_EMAIL: 'info@site.co', LEAD_WEBHOOK_URL: 'https://hook' },
      fetchImpl,
      logger: silent,
      business: null,
    });
    expect(r.status).toBe('partial');
    expect(r.error).toContain('resend 401');

    const boom = vi.fn(async () => {
      throw new Error('network down');
    });
    const r2 = await notifyLead(lead(), { env: { LEAD_WEBHOOK_URL: 'https://hook' }, fetchImpl: boom, logger: silent, business: null });
    expect(r2.status).toBe('failed');
    expect(r2.error).toContain('network down');
  });

  it('emails the business directly for direct routing', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    const r = await notifyLead(lead({ type: 'business_contact', business_id: direct.businessId }), {
      env: { RESEND_API_KEY: 'k', LEAD_NOTIFY_EMAIL: 'info@site.co' },
      fetchImpl,
      logger: silent,
      business: direct,
    });
    expect(r.forwardedTo).toBe('oded@pro.co');
    const sent = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(sent.to).toEqual(['oded@pro.co']);
  });

  it('records the outcome on the lead via the db client', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const db = { from: vi.fn(() => ({ update })) };
    await notifyLead(lead(), { env: {}, logger: silent, business: null, db: db as never });
    expect(db.from).toHaveBeenCalledWith('leads');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ notify_status: 'logged', notify_error: null }));
    expect(eq).toHaveBeenCalledWith('id', lead().id);
  });
});
