import { afterEach, describe, expect, it, vi } from 'vitest';

// getPaymentProvider caches its provider, so each case loads a fresh module.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import('@/lib/payments');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mock payments on production', () => {
  it('are allowed locally (not on Vercel)', async () => {
    const m = await load({ PAYMENT_PROVIDER: 'mock', VERCEL: undefined, VERCEL_ENV: undefined, PAYMENT_MOCK_SECRET: 'x' });
    expect(m.onlinePaymentsEnabled()).toBe(true);
    expect(m.getPaymentProvider().name).toBe('mock');
  });

  // QA: previews may share the production database, so a mock "purchase" there
  // would feature a business on the live site for free.
  it('are refused on preview deployments too', async () => {
    const m = await load({ PAYMENT_PROVIDER: 'mock', VERCEL: '1', VERCEL_ENV: 'preview', PAYMENT_MOCK_SECRET: 'x' });
    expect(m.onlinePaymentsEnabled()).toBe(false);
    expect(() => m.getPaymentProvider()).toThrow(m.PaymentConfigurationError);
  });

  it('can be re-enabled on a preview only explicitly', async () => {
    const m = await load({ PAYMENT_PROVIDER: 'mock', VERCEL: '1', VERCEL_ENV: 'preview', PAYMENT_ALLOW_MOCK_IN_PRODUCTION: 'true', PAYMENT_MOCK_SECRET: 'x' });
    expect(m.onlinePaymentsEnabled()).toBe(true);
  });

  it('are refused on production, including the default provider', async () => {
    const m = await load({ PAYMENT_PROVIDER: undefined, VERCEL_ENV: 'production' });
    expect(m.onlinePaymentsEnabled()).toBe(false);
    expect(() => m.getPaymentProvider()).toThrow(m.PaymentConfigurationError);
  });

  it('can be re-enabled on production only explicitly', async () => {
    const m = await load({
      PAYMENT_PROVIDER: 'mock',
      VERCEL_ENV: 'production',
      PAYMENT_ALLOW_MOCK_IN_PRODUCTION: 'true',
      PAYMENT_MOCK_SECRET: 'x',
    });
    expect(m.onlinePaymentsEnabled()).toBe(true);
  });

  it('do not block a real provider on production', async () => {
    const m = await load({ PAYMENT_PROVIDER: 'upay', VERCEL_ENV: 'production' });
    expect(m.onlinePaymentsEnabled()).toBe(true);
  });
});
