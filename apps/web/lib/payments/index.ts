import 'server-only';

import { MockProvider } from './mock';
import { UpayProvider } from './upay';
import { type PaymentProvider, type PaymentProviderName, PaymentConfigurationError } from './types';

export * from './types';

let cached: PaymentProvider | null = null;

/**
 * The active payment provider, selected by PAYMENT_PROVIDER ('mock' | 'upay').
 * Defaults to 'mock' so development and staging work without credentials.
 */
function providerName(): PaymentProviderName {
  return (process.env.PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase() as PaymentProviderName;
}

/**
 * The mock provider marks orders paid without charging anyone, so it is refused
 * on a Vercel production deployment unless PAYMENT_ALLOW_MOCK_IN_PRODUCTION=true.
 */
function mockBlocked(name: PaymentProviderName): boolean {
  return (
    name === 'mock' &&
    process.env.VERCEL_ENV === 'production' &&
    process.env.PAYMENT_ALLOW_MOCK_IN_PRODUCTION !== 'true'
  );
}

/** Whether the site may offer online purchase (buy buttons, add to cart, checkout). */
export function onlinePaymentsEnabled(): boolean {
  return !mockBlocked(providerName());
}

export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const name = providerName();
  if (mockBlocked(name)) {
    throw new PaymentConfigurationError('Mock payments are disabled in production; configure PAYMENT_PROVIDER=upay');
  }
  switch (name) {
    case 'mock':
      cached = new MockProvider();
      break;
    case 'upay':
      cached = new UpayProvider();
      break;
    default:
      throw new PaymentConfigurationError(`Unknown PAYMENT_PROVIDER: ${String(name)}`);
  }
  return cached;
}

/**
 * Provider for a callback that names its provider. Only the ACTIVE provider is
 * accepted, so e.g. mock callbacks are rejected once PAYMENT_PROVIDER=upay.
 */
export function getPaymentProviderForCallback(name: string): PaymentProvider {
  const active = getPaymentProvider();
  if (active.name !== name) {
    throw new PaymentConfigurationError(`Callback for inactive payment provider: ${name}`);
  }
  return active;
}
