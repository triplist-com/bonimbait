import { NextResponse } from 'next/server';
import { completeTierCheckout } from '@/lib/revenue/checkout';

export const dynamic = 'force-dynamic';

/**
 * Return (and webhook) for a partner tier purchase. Verifies the signed
 * payment, activates the subscription idempotently, then sends the owner back
 * to their portal: ?upgraded=1 on success, ?checkout=failed otherwise.
 */
async function handle(request: Request): Promise<NextResponse> {
  const base = new URL(request.url);
  let outcome: Awaited<ReturnType<typeof completeTierCheckout>>;
  try {
    outcome = await completeTierCheckout(request);
  } catch (err) {
    console.error(`[revenue] tier checkout callback failed: ${err instanceof Error ? err.message : String(err)}`);
    outcome = { kind: 'rejected', status: 400, reason: 'error' };
  }
  // Server-to-server notifications get a status, browsers a redirect.
  if (request.method === 'POST') {
    return NextResponse.json({ ok: outcome.kind === 'activated' }, { status: outcome.kind === 'rejected' ? outcome.status : 200 });
  }
  const target = new URL('/partner-portal/', base);
  if (outcome.kind !== 'rejected') target.searchParams.set('b', outcome.businessId);
  target.searchParams.set(outcome.kind === 'activated' ? 'upgraded' : 'checkout', outcome.kind === 'activated' ? '1' : 'failed');
  return NextResponse.redirect(target, 303);
}

export const GET = handle;
export const POST = handle;
