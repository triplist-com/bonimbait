/**
 * Revenue RLS against the LOCAL Supabase stack, with real JWTs: two business
 * owners (pro owns business A, pro2 owns business B), a member, staff (an
 * editor) and anonymous visitors.
 *
 *   REVENUE_RLS_TEST=1 npx vitest run tests/revenue/rls.test.ts
 *
 * Opt-in (it writes to the shared local DB) and local-only: it refuses any
 * URL that isn't http://127.0.0.1:54321 or localhost. Test users live on the
 * @bonimbait.test domain with a fresh random password per run; the
 * businesses, leads, subscriptions, campaigns, deals and the routing rule it
 * creates are removed afterwards.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));
const env: Record<string, string> = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(URL_);
const ENABLED = process.env.REVENUE_RLS_TEST === '1' && LOCAL && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

type Db = SupabaseClient;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

const USERS = {
  pro: 'revenue-rls-pro@bonimbait.test',
  pro2: 'revenue-rls-pro2@bonimbait.test',
  member: 'revenue-rls-member@bonimbait.test',
  staff: 'revenue-rls-staff@bonimbait.test',
} as const;
type Who = keyof typeof USERS;

const FROM = new Date(Date.now() - 30 * 86_400_000).toISOString();
const TO = new Date(Date.now() + 86_400_000).toISOString();
const forbidden = (e: { code?: string; message?: string } | null) =>
  Boolean(e) && (e!.code === '42501' || /row-level security|permission denied/i.test(e!.message ?? ''));

describe.skipIf(!ENABLED)('revenue RLS on the local stack', () => {
  let admin: Db;
  let anon: Db;
  const ids = {} as Record<Who, string>;
  const as = {} as Record<Who, Db>;
  const run = randomBytes(4).toString('hex');
  const biz = { a: '', b: '' };
  const lead = { a: '', routedToA: '', b: '', member: '' };
  const campaign = { live: '', paused: '' };
  let ruleId = '';
  const marker = `rls-${run}`;

  async function ensureUser(who: Who): Promise<void> {
    const email = USERS[who];
    const password = randomBytes(18).toString('base64url');
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let user = list.users.find((u) => u.email === email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      user = data.user;
    } else {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
    }
    ids[who] = user.id;
    await admin.from('profiles').update({ role: who === 'staff' ? 'editor' : 'member' }).eq('id', user.id);
    const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    as[who] = client;
  }

  async function insertLead(row: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin.from('leads').insert({ full_name: 'בדיקת הרשאות', status: 'new', ...row }).select('id').single();
    if (error) throw error;
    return data.id as string;
  }

  async function cleanup() {
    const bizIds = [biz.a, biz.b].filter(Boolean);
    if (bizIds.length) {
      await admin.from('partner_deals').delete().in('business_id', bizIds);
      await admin.from('partner_campaigns').delete().in('business_id', bizIds);
      await admin.from('partner_subscriptions').delete().in('business_id', bizIds);
    }
    await admin.from('leads').delete().contains('payload', { rls_marker: marker });
    if (ruleId) await admin.from('lead_routing_rules').delete().eq('id', ruleId);
    if (bizIds.length) await admin.from('businesses').delete().in('id', bizIds);
  }

  beforeAll(async () => {
    admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts);
    anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    for (const who of Object.keys(USERS) as Who[]) await ensureUser(who);

    const mk = async (key: 'a' | 'b', owner: string, status: string) => {
      const { data, error } = await admin
        .from('businesses')
        .insert({ slug: `revenue-rls-${key}-${run}`, name: `בדיקת הרשאות ${key}`, status, owner_member_id: owner })
        .select('id')
        .single();
      if (error) throw error;
      biz[key] = data.id as string;
    };
    await mk('a', ids.pro, 'published');
    await mk('b', ids.pro2, 'draft');

    const { data: tier } = await admin.from('partner_tiers').select('id, price_agorot').eq('slug', 'members').single();
    const sub = await admin.from('partner_subscriptions').insert({ business_id: biz.a, tier_id: tier!.id, status: 'active', price_agorot: tier!.price_agorot });
    if (sub.error) throw sub.error;

    const camp = async (status: string) => {
      const { data, error } = await admin
        .from('partner_campaigns')
        .insert({ business_id: biz.a, name: `rls ${status}`, status, headline: 'בדיקה', target_url: `/business/revenue-rls-a-${run}/` })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    };
    campaign.live = await camp('active');
    campaign.paused = await camp('paused');

    const rule = await admin.from('lead_routing_rules').insert({ name: `rls ${run}`, target: 'owner_inbox', is_active: false }).select('id').single();
    if (rule.error) throw rule.error;
    ruleId = rule.data.id as string;

    const payload = { rls_marker: marker };
    lead.a = await insertLead({ type: 'business_contact', business_id: biz.a, score: 40, payload });
    lead.routedToA = await insertLead({ type: 'consultation', score: 80, payload: { ...payload, routing: { business_id: biz.a, target: 'business', rule_id: null } } });
    lead.b = await insertLead({ type: 'business_contact', business_id: biz.b, payload });
    lead.member = await insertLead({ type: 'consultation', member_id: ids.member, payload });
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup();
  }, 60_000);

  it('subscriptions: an owner reads only their own and changes nothing', async () => {
    const own = await as.pro.from('partner_subscriptions').select('business_id, status');
    expect(own.error).toBeNull();
    expect(own.data?.map((r) => r.business_id)).toEqual([biz.a]);
    expect((await as.pro2.from('partner_subscriptions').select('id').eq('business_id', biz.a)).data).toEqual([]);
    expect((await as.member.from('partner_subscriptions').select('id')).data).toEqual([]);
    const a = await anon.from('partner_subscriptions').select('id');
    expect(a.error !== null || a.data?.length === 0).toBe(true);
    expect((await as.staff.from('partner_subscriptions').select('id').eq('business_id', biz.a)).data).toHaveLength(1);

    const upd = await as.pro.from('partner_subscriptions').update({ status: 'canceled' }).eq('business_id', biz.a).select('id');
    expect(upd.error !== null || upd.data?.length === 0).toBe(true);
    const { data: tier } = await admin.from('partner_tiers').select('id').eq('slug', 'ambassadors').single();
    const self = await as.pro2.from('partner_subscriptions').insert({ business_id: biz.b, tier_id: tier!.id, status: 'active', price_agorot: 1 });
    expect(forbidden(self.error)).toBe(true);
  });

  it('metrics RPCs: owners and staff only (42501 for everyone else)', async () => {
    // revenue_business_metrics() is service-role only (QA, 20261014131000): it runs
    // patterns over every visitor's questions. The app calls it after
    // canReadBusinessMetrics() (lib/revenue/metrics.ts), which uses these two checks.
    const args = (id: string) => ({ p_business_id: id, p_from: FROM, p_to: TO, p_patterns: [] as string[] });
    for (const db of [as.pro, as.member, as.staff, anon]) {
      expect((await db.rpc('revenue_business_metrics', args(biz.a))).error).not.toBeNull();
    }
    const own = await admin.rpc('revenue_business_metrics', args(biz.a));
    expect(own.error).toBeNull();
    expect(own.data).toHaveProperty('leads');
    expect((await as.pro.rpc('revenue_owns_business', { p_business: biz.a })).data).toBe(true);
    expect((await as.pro.rpc('revenue_owns_business', { p_business: biz.b })).data).toBe(false);
    expect((await as.staff.rpc('is_staff')).data).toBe(true);
    expect((await as.member.rpc('is_staff')).data).toBe(false);

    expect((await as.pro.rpc('revenue_peer_rank', { p_business_id: biz.a, p_from: FROM, p_to: TO })).error).toBeNull();
    expect((await as.pro2.rpc('revenue_peer_rank', { p_business_id: biz.a, p_from: FROM, p_to: TO })).error?.code).toBe('42501');
    expect((await as.pro.rpc('revenue_partner_overview', { p_from: FROM, p_to: TO })).error?.code).toBe('42501');
    expect((await as.staff.rpc('revenue_partner_overview', { p_from: FROM, p_to: TO })).error).toBeNull();
  });

  it("leads: an owner reads their business's leads and the ones routed to them, nobody else's", async () => {
    const mine = await as.pro.from('leads').select('id').contains('payload', { rls_marker: marker });
    expect(mine.error).toBeNull();
    expect(new Set(mine.data?.map((l) => l.id))).toEqual(new Set([lead.a, lead.routedToA]));
    const theirs = await as.pro2.from('leads').select('id').contains('payload', { rls_marker: marker });
    expect(theirs.data?.map((l) => l.id)).toEqual([lead.b]);
    expect((await as.member.from('leads').select('id').contains('payload', { rls_marker: marker })).data).toEqual([]);
    const a = await anon.from('leads').select('id').contains('payload', { rls_marker: marker });
    expect(a.error !== null || a.data?.length === 0).toBe(true);
    expect((await as.staff.from('leads').select('id').contains('payload', { rls_marker: marker })).data).toHaveLength(4);
  });

  it('leads: the score, booking and routing are server-owned', async () => {
    // An owner can't change a lead (no update policy) ...
    const upd = await as.pro.from('leads').update({ score: 99 }).eq('id', lead.a).select('id');
    expect(upd.error !== null || upd.data?.length === 0).toBe(true);
    expect((await admin.from('leads').select('score').eq('id', lead.a).single()).data?.score).toBe(40);

    // ... and a visitor's insert can't smuggle them in: the guard drops them.
    const forged = `${marker}-forged`;
    const ins = await anon.from('leads').insert({
      type: 'consultation',
      full_name: 'בדיקת הרשאות',
      score: 99,
      booked_at: new Date().toISOString(),
      payload: {
        rls_marker: marker,
        rls_forged: forged,
        project_score: { version: 1, score: 99, band: 'hot', reasons: [], missing: [] },
        routing: { business_id: biz.a, target: 'business' },
        booking: { status: 'booked' },
      },
    });
    expect(ins.error).toBeNull();
    const { data: stored } = await admin.from('leads').select('score, booked_at, payload').contains('payload', { rls_forged: forged }).single();
    expect(stored?.score).toBeNull();
    expect(stored?.booked_at).toBeNull();
    expect(stored?.payload).not.toHaveProperty('project_score');
    expect(stored?.payload).not.toHaveProperty('routing');
    expect(stored?.payload).not.toHaveProperty('booking');
    // So the forged "routing" doesn't put it in the owner's inbox.
    expect((await as.pro.from('leads').select('id').contains('payload', { rls_forged: forged })).data).toEqual([]);
  });

  it('deals: an owner marks deals only on their own (or routed) leads', async () => {
    const own = await as.pro.from('partner_deals').insert({ business_id: biz.a, lead_id: lead.a, value_agorot: 1_000_000 }).select('id').single();
    expect(own.error).toBeNull();
    const routed = await as.pro.from('partner_deals').insert({ business_id: biz.a, lead_id: lead.routedToA, value_agorot: 500_000 }).select('id').single();
    expect(routed.error).toBeNull();
    expect(forbidden((await as.pro.from('partner_deals').insert({ business_id: biz.a, lead_id: lead.b, value_agorot: 1 })).error)).toBe(true);
    expect(forbidden((await as.pro.from('partner_deals').insert({ business_id: biz.b, value_agorot: 1 })).error)).toBe(true);
    expect((await as.pro2.from('partner_deals').select('id').eq('business_id', biz.a)).data).toEqual([]);
    expect((await as.member.from('partner_deals').select('id').eq('business_id', biz.a)).data).toEqual([]);
    // Moving a deal onto someone else's lead is refused too.
    const move = await as.pro.from('partner_deals').update({ lead_id: lead.b }).eq('id', own.data!.id).select('id');
    expect(forbidden(move.error) || move.data?.length === 0).toBe(true);
    const del = await as.pro.from('partner_deals').delete().eq('id', own.data!.id).select('id');
    expect(del.data).toHaveLength(1);
  });

  it('routing rules are staff-only', async () => {
    expect((await as.pro.from('lead_routing_rules').select('id').eq('id', ruleId)).data).toEqual([]);
    expect(forbidden((await as.pro.from('lead_routing_rules').insert({ name: 'x', target: 'owner_inbox' })).error)).toBe(true);
    expect((await as.staff.from('lead_routing_rules').select('id').eq('id', ruleId)).data).toHaveLength(1);
  });

  it('tiers, campaigns and badges: public what is public', async () => {
    const tiers = await anon.from('partner_tiers').select('slug');
    expect(tiers.data?.map((t) => t.slug).sort()).toEqual(['ambassadors', 'members', 'partners']);
    const tu = await as.pro.from('partner_tiers').update({ price_agorot: 1 }).eq('slug', 'members').select('slug');
    expect(tu.error !== null || tu.data?.length === 0).toBe(true);

    const ids2 = [campaign.live, campaign.paused];
    expect((await anon.from('partner_campaigns').select('id').in('id', ids2)).data?.map((c) => c.id)).toEqual([campaign.live]);
    expect((await as.pro2.from('partner_campaigns').select('id').in('id', ids2)).data?.map((c) => c.id)).toEqual([campaign.live]);
    expect((await as.pro.from('partner_campaigns').select('id').in('id', ids2)).data).toHaveLength(2);
    const cu = await as.pro.from('partner_campaigns').update({ status: 'active' }).eq('id', campaign.paused).select('id');
    expect(cu.error !== null || cu.data?.length === 0).toBe(true);

    const badges = await anon.from('partner_badges').select('business_id, tier_slug, badge_label').in('business_id', [biz.a, biz.b]);
    expect(badges.data).toEqual([{ business_id: biz.a, tier_slug: 'members', badge_label: expect.any(String) }]);
  });
});
