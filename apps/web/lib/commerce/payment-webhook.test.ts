/**
 * Webhook / return-URL idempotency: drives the real applyPaymentResult()
 * (lib/db/commerce.ts) against a tiny in-memory stand-in for the Supabase
 * query builder, plus the pure transition rules.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyPaymentResult } from '@/lib/db/commerce';
import type { DbClient } from '@/lib/db/client';
import { PaymentAmountMismatchError, decidePaymentTransition } from './payment-transitions';

type Row = Record<string, unknown>;

/** Minimal fake: from(t).select().eq()…maybeSingle()/single(), update(p).eq()…select().maybeSingle(). */
function createFakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; patch: Row }> = [];
  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let patch: Row | null = null;
    const match = () => tables[table].filter((r) => filters.every(([k, v]) => r[k] === v));
    const run = () => {
      const rows = match();
      if (patch) {
        for (const r of rows) Object.assign(r, patch);
        if (rows.length) writes.push({ table, patch });
      }
      return rows.map((r) => ({ ...r }));
    };
    const api = {
      select: () => api,
      update: (p: Row) => {
        patch = p;
        return api;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return api;
      },
      maybeSingle: async () => {
        const rows = run();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const rows = run();
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'not single' } };
      },
    };
    return api;
  }
  return { db: { from: builder } as unknown as DbClient, writes };
}

let tables: Record<string, Row[]>;
let fake: ReturnType<typeof createFakeDb>;

beforeEach(() => {
  tables = {
    orders: [{ id: 'o1', status: 'pending', paid_at: null, total_agorot: 814_200 }],
    payments: [
      { id: 'p1', order_id: 'o1', provider: 'mock', provider_ref: 'ref-1', status: 'pending', amount_agorot: 814_200 },
    ],
  };
  fake = createFakeDb(tables);
});

const success = {
  provider: 'mock' as const,
  providerRef: 'ref-1',
  status: 'succeeded' as const,
  amountAgorot: 814_200,
};

describe('applyPaymentResult idempotency', () => {
  it('marks payment succeeded and order paid on the first callback', async () => {
    const res = await applyPaymentResult(fake.db, success);
    expect(res.changed).toBe(true);
    expect(res.payment.status).toBe('succeeded');
    expect(res.order.status).toBe('paid');
    expect(res.order.paid_at).toBeTruthy();
    expect(fake.writes).toHaveLength(2);
  });

  it('writes nothing when the same webhook is delivered again', async () => {
    await applyPaymentResult(fake.db, success);
    const paidAt = tables.orders[0].paid_at;
    fake.writes.length = 0;

    const again = await applyPaymentResult(fake.db, success);
    const thrice = await applyPaymentResult(fake.db, success);
    expect(again.changed).toBe(false);
    expect(thrice.changed).toBe(false);
    expect(fake.writes).toHaveLength(0);
    expect(tables.orders[0].paid_at).toBe(paidAt);
  });

  it('ignores a late failure after success (return URL vs webhook race)', async () => {
    await applyPaymentResult(fake.db, success);
    fake.writes.length = 0;
    const late = await applyPaymentResult(fake.db, { ...success, status: 'failed', amountAgorot: null });
    expect(late.changed).toBe(false);
    expect(tables.payments[0].status).toBe('succeeded');
    expect(tables.orders[0].status).toBe('paid');
    expect(fake.writes).toHaveLength(0);
  });

  it('marks a failed attempt, then accepts a later success for the same payment', async () => {
    const failed = await applyPaymentResult(fake.db, { ...success, status: 'failed', amountAgorot: null });
    expect(failed.order.status).toBe('failed');
    const repeatFail = await applyPaymentResult(fake.db, { ...success, status: 'failed', amountAgorot: null });
    expect(repeatFail.changed).toBe(false);
    const ok = await applyPaymentResult(fake.db, success);
    expect(ok.order.status).toBe('paid');
  });

  it('rejects an amount mismatch without writing', async () => {
    await expect(applyPaymentResult(fake.db, { ...success, amountAgorot: 1 })).rejects.toBeInstanceOf(
      PaymentAmountMismatchError,
    );
    expect(fake.writes).toHaveLength(0);
    expect(tables.orders[0].status).toBe('pending');
  });

  it('rejects an unknown provider reference', async () => {
    await expect(applyPaymentResult(fake.db, { ...success, providerRef: 'nope' })).rejects.toThrow(/Unknown payment/);
  });

  it('does not re-pay when a concurrent callback already paid the order (compare-and-set)', async () => {
    // Simulate: another request flipped the order to paid between our read and write.
    tables.orders[0].status = 'paid';
    tables.orders[0].paid_at = '2026-01-01T00:00:00.000Z';
    const res = await applyPaymentResult(fake.db, success);
    expect(res.order.paid_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('decidePaymentTransition', () => {
  const pending = { status: 'pending' as const, amountAgorot: 100 };
  it('pending -> succeeded pays the order', () => {
    expect(decidePaymentTransition(pending, { status: 'pending' }, { status: 'succeeded', amountAgorot: 100 })).toEqual({
      payment: 'succeeded',
      order: 'paid',
    });
  });
  it('cancel fails a pending order', () => {
    expect(decidePaymentTransition(pending, { status: 'pending' }, { status: 'cancelled' })).toEqual({
      payment: 'cancelled',
      order: 'failed',
    });
  });
  it('refund of a paid order', () => {
    expect(
      decidePaymentTransition({ status: 'succeeded', amountAgorot: 100 }, { status: 'paid' }, { status: 'refunded' }),
    ).toEqual({ payment: 'refunded', order: 'refunded' });
  });
  it('succeeded never goes back to pending', () => {
    expect(
      decidePaymentTransition({ status: 'succeeded', amountAgorot: 100 }, { status: 'paid' }, { status: 'pending' }),
    ).toEqual({ payment: null, order: null });
  });
  it('a missing amount on success is accepted (provider verified server-side)', () => {
    expect(decidePaymentTransition(pending, { status: 'pending' }, { status: 'succeeded' }).order).toBe('paid');
  });
});
