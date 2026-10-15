import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RULE_NAME,
  evaluateRouting,
  orderRules,
  routingRecord,
  ruleMatches,
  type RoutingFacts,
  type RoutingRule,
} from '@/lib/revenue/routing';
import { invalidateRoutingRules, resolveLeadRouting } from '@/lib/revenue/routing-server';
import { describeLead, planNotification, resolveRecipient } from '@/lib/leads/notify';
import type { LeadRow } from '@/lib/db/types';
import type { DbClient } from '@/lib/db/client';
import { fakeDb } from './fake-db';

const BIZ = '00000000-0000-4000-8000-0000000000b1';
const PARTNER = '00000000-0000-4000-8000-0000000000c1';
const CAMPAIGN = '00000000-0000-4000-8000-0000000000d1';

const facts = (over: Partial<RoutingFacts> = {}): RoutingFacts => ({
  type: 'consultation',
  specialtySlugs: [],
  regionSlug: 'sharon',
  stage: 'permit',
  score: 82,
  businessId: null,
  ...over,
});

let n = 0;
const rule = (over: Partial<RoutingRule> = {}): RoutingRule => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  name: `כלל ${n}`,
  is_active: true,
  priority: 100,
  lead_types: [],
  specialty_slugs: [],
  region_slugs: [],
  stages: [],
  min_score: null,
  max_score: null,
  target: 'owner_inbox',
  target_business_id: null,
  target_campaign_id: null,
  ...over,
});

describe('evaluateRouting', () => {
  it('falls back to the built-in default (today\'s behaviour) with no rules', () => {
    expect(evaluateRouting(facts(), [])).toEqual({
      ruleId: null,
      ruleName: DEFAULT_RULE_NAME,
      target: 'business_default',
      businessId: null,
      campaignId: null,
    });
  });

  it('matches every condition, and an empty condition matches anything', () => {
    const r = rule({
      lead_types: ['consultation'],
      specialty_slugs: ['קבלני-אלומיניום'],
      region_slugs: ['sharon', 'center'],
      stages: ['permit'],
      min_score: 70,
      max_score: 90,
    });
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'] }))).toBe(true);
    expect(ruleMatches(r, facts({ specialtySlugs: [] }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], type: 'contact' }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], regionSlug: 'south' }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], regionSlug: null }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], stage: 'frame' }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], score: 69 }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], score: 91 }))).toBe(false);
    expect(ruleMatches(r, facts({ specialtySlugs: ['קבלני-אלומיניום'], score: null }))).toBe(false);
    expect(ruleMatches(rule(), facts({ regionSlug: null, stage: null, score: null }))).toBe(true);
    expect(ruleMatches(rule({ is_active: false }), facts())).toBe(false);
  });

  it('takes the first match by priority', () => {
    const late = rule({ priority: 200, target: 'owner_inbox' });
    const early = rule({ priority: 10, target: 'business', target_business_id: BIZ });
    expect(evaluateRouting(facts(), [late, early])).toMatchObject({ ruleId: early.id, target: 'business', businessId: BIZ });
    expect(orderRules([late, early]).map((r) => r.id)).toEqual([early.id, late.id]);
  });

  it('forwards to a live campaign\'s partner, and skips a rule whose campaign is gone', () => {
    const viaCampaign = rule({ priority: 1, target: 'partner_campaign', target_campaign_id: CAMPAIGN });
    const fallback = rule({ priority: 2, target: 'owner_inbox' });
    const live = (id: string) => (id === CAMPAIGN ? PARTNER : null);
    expect(evaluateRouting(facts(), [viaCampaign, fallback], live)).toMatchObject({
      target: 'partner_campaign',
      businessId: PARTNER,
      campaignId: CAMPAIGN,
    });
    expect(evaluateRouting(facts(), [viaCampaign, fallback], () => null)).toMatchObject({ ruleId: fallback.id, target: 'owner_inbox' });
  });

  it('records the decision for the lead payload', () => {
    const r = rule({ target: 'business', target_business_id: BIZ, name: 'אלומיניום בשרון' });
    expect(routingRecord(evaluateRouting(facts(), [r]))).toEqual({
      rule_id: r.id,
      rule_name: 'אלומיניום בשרון',
      target: 'business',
      business_id: BIZ,
      campaign_id: null,
    });
  });
});

describe('resolveLeadRouting (server)', () => {
  afterEach(() => invalidateRoutingRules());

  const rows = {
    lead_routing_rules: [
      { ...rule({ priority: 5, target: 'partner_campaign', target_campaign_id: CAMPAIGN, specialty_slugs: ['קבלני-אלומיניום'] }) },
      { ...rule({ priority: 9, target: 'owner_inbox', min_score: 80 }) },
    ],
    partner_campaigns: [{ id: CAMPAIGN, business_id: PARTNER, status: 'active', starts_at: null, ends_at: null }],
    businesses: [{ id: PARTNER, name: 'חלונות לדוגמה', slug: 'חלונות-לדוגמה', lead_routing: 'site' }],
    business_contacts: [{ business_id: PARTNER, lead_email: 'leads@partner.example' }],
  };

  it('forwards to the partner\'s lead email', async () => {
    const res = await resolveLeadRouting(fakeDb(rows) as unknown as DbClient, facts({ specialtySlugs: ['קבלני-אלומיניום'] }));
    expect(res.decision).toMatchObject({ target: 'partner_campaign', businessId: PARTNER, campaignId: CAMPAIGN });
    expect(res.route).toEqual({ kind: 'business', business: { leadEmail: 'leads@partner.example' } });
  });

  it('sends hot leads to the owner inbox and leaves the rest on the default', async () => {
    const db = fakeDb(rows) as unknown as DbClient;
    expect((await resolveLeadRouting(db, facts({ score: 85 }))).route).toEqual({ kind: 'site' });
    expect((await resolveLeadRouting(db, facts({ score: 40 })))).toMatchObject({ route: null, decision: { target: 'business_default' } });
  });

  it('never throws: a broken rules table means default routing', async () => {
    const broken = { from: () => { throw new Error('db down'); } } as unknown as DbClient;
    const res = await resolveLeadRouting(broken, facts());
    expect(res).toEqual({ decision: expect.objectContaining({ target: 'business_default' }), route: null });
  });
});

describe('notify with a routing override', () => {
  const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
    id: '00000000-0000-4000-8000-000000000001',
    type: 'business_contact',
    status: 'new',
    full_name: 'בונה לדוגמה',
    email: 'b@example.com',
    phone: '0501234567',
    message: null,
    region_id: null,
    construction_stage: 'tender',
    payload: {
      kind: 'contact_form',
      project_file: { version: 1, stage: 'permit', regionSlug: 'sharon', sizeM2: 220, questions: [{ q: 'כמה עולים חלונות?', at: '2026-10-10T08:00:00.000Z' }] },
      project_score: { version: 1, score: 82, band: 'hot', reasons: [], missing: [] },
      routing: { target: 'business_default' },
    },
    source_url: '/business/x/',
    utm: {},
    business_id: BIZ,
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
    ip_hash: null,
    ref: 'BB-26-000123',
    attribution: null,
    created_at: '2026-10-14T10:00:00Z',
    updated_at: '2026-10-14T10:00:00Z',
    ...over,
  });
  const direct = { businessId: BIZ, businessName: 'עסק', businessSlug: 'עסק', leadRouting: 'direct' as const, leadEmail: 'pro@biz.example' };

  it('keeps today\'s routing without an override', () => {
    expect(resolveRecipient(lead(), direct, 'info@site.example')).toEqual({ to: ['pro@biz.example'], routedTo: 'business' });
  });

  it('obeys a site or business override, falling back to the inbox without an email', () => {
    expect(resolveRecipient(lead(), direct, 'info@site.example', { kind: 'site' })).toEqual({ to: ['info@site.example'], routedTo: 'site' });
    expect(resolveRecipient(lead(), null, 'info@site.example', { kind: 'business', business: { leadEmail: 'p@x.example' } })).toEqual({
      to: ['p@x.example'],
      routedTo: 'business',
    });
    expect(resolveRecipient(lead(), null, 'info@site.example', { kind: 'business', business: { leadEmail: null } })).toEqual({
      to: ['info@site.example'],
      routedTo: 'site',
    });
  });

  it('summarizes the project file and shows the score only to the owner\'s team', () => {
    const rows = describeLead(lead(), direct);
    expect(rows).toContainEqual(['תיק פרויקט', 'היתר/מכרז · אזור השרון · 220 מ״ר']);
    expect(rows).toContainEqual(['שאלות אחרונות', 'כמה עולים חלונות?']);
    expect(rows.some(([, v]) => v.includes('[object Object]'))).toBe(false);

    const env = { RESEND_API_KEY: 'k', LEAD_NOTIFY_EMAIL: 'info@site.example' };
    const toSite = planNotification(lead(), direct, env, { kind: 'site' });
    expect(toSite.email?.text).toContain('ציון ליד: 82 (חם)');
    const toPro = planNotification(lead(), direct, env);
    expect(toPro.email?.to).toEqual(['pro@biz.example']);
    expect(toPro.email?.text).not.toContain('ציון ליד');
  });
});
