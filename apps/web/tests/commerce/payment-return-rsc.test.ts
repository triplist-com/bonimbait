/**
 * Payment return routes and server-action redirects: Next's internal RSC fetch
 * of a same-host redirect target gets an empty 204 and applies nothing, so the
 * browser falls back to a full page load (lib/payments/return.ts). A normal
 * browser return still applies the payment and redirects.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlePaymentCallback = vi.fn();
const completeTierCheckout = vi.fn();

vi.mock('@/lib/commerce/payment-callback', () => ({ handlePaymentCallback }));
vi.mock('@/lib/revenue/checkout', () => ({ completeTierCheckout }));

const RETURN_QUERY = '?provider=mock&ref=mock_1&order=o1&amount=100&status=succeeded&sig=x';

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3121${path}${RETURN_QUERY}`, { headers });
}

beforeEach(() => {
  handlePaymentCallback.mockReset();
  completeTierCheckout.mockReset();
});

describe('/api/payments/return', () => {
  it('answers the RSC fetch of a server-action redirect with 204 and applies nothing', async () => {
    const { GET } = await import('@/app/api/payments/return/route');
    const res = await GET(get('/api/payments/return', { rsc: '1' }));
    expect(res.status).toBe(204);
    expect(handlePaymentCallback).not.toHaveBeenCalled();
  });

  it('applies a browser return and sends the buyer to the thank-you page', async () => {
    handlePaymentCallback.mockResolvedValue({ kind: 'applied', order: { id: 'o1', status: 'paid' }, changed: true });
    const { GET } = await import('@/app/api/payments/return/route');
    const res = await GET(get('/api/payments/return'));
    expect(handlePaymentCallback).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3121/thank-you-order/?order=o1');
  });
});

describe('/api/partner-checkout/return', () => {
  it('answers the RSC fetch of a server-action redirect with 204 and applies nothing', async () => {
    const { GET } = await import('@/app/api/partner-checkout/return/route');
    const res = await GET(get('/api/partner-checkout/return/', { rsc: '1' }));
    expect(res.status).toBe(204);
    expect(completeTierCheckout).not.toHaveBeenCalled();
  });

  it('activates a browser return and sends the owner back to the portal', async () => {
    completeTierCheckout.mockResolvedValue({ kind: 'activated', businessId: 'b1' });
    const { GET } = await import('@/app/api/partner-checkout/return/route');
    const res = await GET(get('/api/partner-checkout/return/'));
    expect(completeTierCheckout).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3121/partner-portal/?b=b1&upgraded=1');
  });
});
