/**
 * The pro portal's tier upsell without online payments (no provider, or the
 * mock provider on a production deployment):
 * - startTierCheckout refuses before writing a pending subscription;
 * - the dashboard offers a conversation ("דברו איתנו על מסלול …") instead of
 *   a checkout that can't happen. With payments on, it keeps the checkout.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callsTo, fakeDb, type FakeDb } from './fake-db';

const BUSINESS = '7d8e9f00-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const OWNER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const state = vi.hoisted(() => ({
  online: true,
  providerCalls: 0,
  user: null as unknown,
  admin: null as unknown,
}));

vi.mock('@/lib/payments', () => ({
  onlinePaymentsEnabled: () => state.online,
  getPaymentProvider: () => {
    state.providerCalls += 1;
    return {
      name: 'mock',
      createCheckout: async () => ({ provider: 'mock', providerRef: 'mock_1', redirectUrl: 'http://localhost/api/partner-checkout/return/?ok=1' }),
    };
  },
  getPaymentProviderForCallback: () => {
    throw new Error('not used');
  },
  PaymentConfigurationError: class extends Error {},
  PaymentVerificationError: class extends Error {},
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock('@/lib/revenue/db', () => ({
  isServiceRoleConfigured: () => true,
  revenueUserDb: () => (state.user as FakeDb).client,
  revenueAdminDb: () => (state.admin as FakeDb).client,
}));

import { startTierCheckout } from '@/lib/revenue/checkout';
import PortalDashboard from '@/components/revenue/portal/PortalDashboard';
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { revenueDemo } from '@/lib/demo/fixtures/revenue';

let user: FakeDb;
let admin: FakeDb;

beforeEach(() => {
  state.online = true;
  state.providerCalls = 0;
  user = fakeDb((call) => (call.table === 'businesses' ? { data: { id: BUSINESS, name: 'שלד לדוגמה', status: 'published', owner_member_id: OWNER } } : { data: null }));
  admin = fakeDb((call) => {
    if (call.table === 'partner_tiers') return { data: { id: 'tier-1', slug: 'partners', name: 'שותפים', price_agorot: 149_000, is_active: true } };
    if (call.table === 'partner_subscriptions' && call.ops.some(([n]) => n === 'insert')) return { data: { id: '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a' } };
    return { data: null };
  });
  state.user = user;
  state.admin = admin;
});

const input = { businessId: BUSINESS, tierSlug: 'partners', userId: OWNER, customer: { name: 'בעל העסק', email: 'pro@bonimbait.test' } };

describe('startTierCheckout without online payments', () => {
  it('refuses before any subscription is written or a provider is asked', async () => {
    state.online = false;
    const res = await startTierCheckout(input);
    expect(res.ok).toBe(false);
    expect(callsTo(admin, 'partner_subscriptions', 'insert')).toHaveLength(0);
    expect(state.providerCalls).toBe(0);
  });

  it('still starts a checkout when payments are on', async () => {
    const res = await startTierCheckout(input);
    expect(res).toMatchObject({ ok: true });
    expect(callsTo(admin, 'partner_subscriptions', 'insert')).toHaveLength(1);
    expect(state.providerCalls).toBe(1);
  });
});

describe('the portal\'s tier cards', () => {
  const { pro } = loadDemoFixture(revenueDemo);

  it('offer a conversation, not a checkout, when payments are off', () => {
    const html = renderToStaticMarkup(<PortalDashboard view={pro} upgradeContactHref="/strategic-partners/" />);
    expect(html).toContain('דברו איתנו על מסלול');
    // (next/link drops the trailing slash outside the Next runtime; the app's trailingSlash adds it back.)
    expect(html).toMatch(/href="\/strategic-partners\/?"/);
    expect(html).not.toContain('name="tier"');
    expect(html).not.toContain('התשלום מאובטח');
  });

  it('keep the checkout when payments are on', async () => {
    const upgrade = async () => undefined;
    const html = renderToStaticMarkup(<PortalDashboard view={pro} upgradeAction={upgrade} upgradeContactHref="/strategic-partners/" />);
    expect(html).toContain('name="tier"');
    expect(html).not.toContain('דברו איתנו על מסלול');
  });

  it('stay the disabled demo buttons on /platform/demo/pro/', () => {
    const html = renderToStaticMarkup(<PortalDashboard view={pro} demo />);
    expect(html).toContain('תצוגת הדגמה');
    expect(html).not.toContain('דברו איתנו על מסלול');
  });
});
