import { NextResponse } from 'next/server';
import { handlePaymentCallback } from '@/lib/commerce/payment-callback';

export const dynamic = 'force-dynamic';

/**
 * Server-to-server payment notification (IPN). Idempotent: providers retry
 * until they get a 2xx, and replays are no-ops. Verification failures get a
 * 4xx (no retry); unexpected errors a 500 (provider retries later).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const outcome = await handlePaymentCallback(request);
    if (outcome.kind === 'rejected') {
      return NextResponse.json({ ok: false, error: outcome.reason }, { status: outcome.status });
    }
    return NextResponse.json({
      ok: true,
      order: outcome.order.order_number,
      status: outcome.order.status,
      changed: outcome.changed,
    });
  } catch (err) {
    console.error('[payments] webhook error', err);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
