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
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const name = (process.env.PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase() as PaymentProviderName;
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
