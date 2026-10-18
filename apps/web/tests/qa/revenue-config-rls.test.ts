/**
 * Revenue configuration is admin-only in the database, as in the app
 * (20261014131100_qa_admin_only_revenue_config.sql):
 *
 *   QA_RLS_TEST=1 npx vitest run tests/qa/revenue-config-rls.test.ts
 *
 * Editors read partner tiers and routing rules but can't change them through
 * the API (a tier price, or a rule that forwards leads to any business);
 * admins can. anon can't call the revenue ownership helpers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, isForbidden, QA_STACK_ENABLED, serviceClient, signedInUser, type Db } from './stack';

describe.skipIf(!QA_STACK_ENABLED)('revenue configuration: staff read, admin write', () => {
  let admin: Db;
  let editor: { id: string; db: Db };
  let siteAdmin: { id: string; db: Db };
  let tier: { id: string; price_agorot: number } | null = null;
  const rules: string[] = [];

  beforeAll(async () => {
    admin = serviceClient();
    editor = await signedInUser(admin, 'qa-config-editor@bonimbait.test', 'editor');
    siteAdmin = await signedInUser(admin, 'qa-config-admin@bonimbait.test', 'admin');
    const t = await admin.from('partner_tiers').select('id, price_agorot').eq('slug', 'members').single();
    if (t.error) throw t.error;
    tier = t.data as { id: string; price_agorot: number };
  });

  afterAll(async () => {
    if (tier) await admin.from('partner_tiers').update({ price_agorot: tier.price_agorot }).eq('id', tier.id);
    if (rules.length) await admin.from('lead_routing_rules').delete().in('id', rules);
  });

  it('an editor reads tiers and rules', async () => {
    expect((await editor.db.from('partner_tiers').select('id')).data?.length).toBeGreaterThanOrEqual(3);
    expect((await editor.db.from('lead_routing_rules').select('id')).error).toBeNull();
  });

  it('an editor cannot change a tier price or add a routing rule', async () => {
    const price = await editor.db.from('partner_tiers').update({ price_agorot: 0 }).eq('id', tier!.id).select('id');
    expect(price.error === null ? price.data?.length : -1).not.toBe(1);
    const still = await admin.from('partner_tiers').select('price_agorot').eq('id', tier!.id).single();
    expect(still.data?.price_agorot).toBe(tier!.price_agorot);

    const rule = await editor.db.from('lead_routing_rules').insert({ name: 'qa editor rule', target: 'owner_inbox', is_active: false }).select('id');
    expect(isForbidden(rule.error)).toBe(true);
  });

  it('an admin changes a tier price and manages routing rules', async () => {
    const price = await siteAdmin.db.from('partner_tiers').update({ price_agorot: tier!.price_agorot + 100 }).eq('id', tier!.id).select('id');
    expect(price.error).toBeNull();
    expect(price.data).toHaveLength(1);
    const rule = await siteAdmin.db.from('lead_routing_rules').insert({ name: 'qa admin rule', target: 'owner_inbox', is_active: false }).select('id').single();
    expect(rule.error).toBeNull();
    rules.push(rule.data!.id as string);
  });

  it('anon cannot call the ownership helpers', async () => {
    const anon = anonClient();
    expect((await anon.rpc('revenue_owns_business', { p_business: tier!.id })).error).not.toBeNull();
    expect((await anon.rpc('revenue_lead_belongs', { p_lead: tier!.id, p_business: tier!.id })).error).not.toBeNull();
    expect((await editor.db.rpc('revenue_owns_business', { p_business: tier!.id })).error).toBeNull();
  });
});
