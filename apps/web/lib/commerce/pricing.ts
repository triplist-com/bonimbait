/**
 * Order money math. Pure functions (no DB, no env) so they can be unit
 * tested and shared by the cart, checkout and createPendingOrder.
 *
 * All amounts are integer agorot. Product prices are VAT-inclusive (as in
 * WooCommerce); service-plan prices are ex-VAT (the live page says
 * "לא כולל מע״מ"), so VAT is added on top of those lines only.
 */

export const DEFAULT_VAT_RATE = 0.18;

/** Parse VAT_RATE; falls back to 18% for empty/invalid values. */
export function parseVatRate(value: string | undefined | null): number {
  if (value === undefined || value === null || value.trim() === '') return DEFAULT_VAT_RATE;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) return DEFAULT_VAT_RATE;
  return rate;
}

export type PricedLine = {
  quantity: number;
  unitPriceAgorot: number;
  /** false = ex-VAT price (service plans); VAT is added on top. */
  vatIncluded: boolean;
};

export type OrderTotals = {
  /** Sum of line totals as priced (ex-VAT lines are counted ex-VAT). */
  subtotalAgorot: number;
  /** VAT added on top of ex-VAT lines. VAT already inside inclusive prices is not repeated here. */
  vatAgorot: number;
  totalAgorot: number;
};

function assertMoney(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer (agorot): ${n}`);
}

export function lineTotal(line: PricedLine): number {
  assertMoney(line.unitPriceAgorot, 'unitPriceAgorot');
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError(`quantity must be a positive integer: ${line.quantity}`);
  }
  return line.quantity * line.unitPriceAgorot;
}

/** VAT on an ex-VAT amount, rounded half-up to whole agorot. */
export function vatOn(amountAgorot: number, vatRate: number): number {
  assertMoney(amountAgorot, 'amountAgorot');
  // Round via integer basis points to avoid float drift (0.18 * 690000 = 124199.99…).
  const bp = Math.round(vatRate * 10_000);
  return Math.floor((amountAgorot * bp + 5_000) / 10_000);
}

/** The VAT-inclusive price of an ex-VAT amount. */
export function withVat(amountAgorot: number, vatRate: number): number {
  return amountAgorot + vatOn(amountAgorot, vatRate);
}

/**
 * Totals for an order. VAT is computed once on the sum of the ex-VAT lines
 * (not per line), so the invoice VAT matches rate × taxable base exactly.
 */
export function computeOrderTotals(lines: PricedLine[], vatRate: number): OrderTotals {
  let subtotal = 0;
  let exVatBase = 0;
  for (const line of lines) {
    const total = lineTotal(line);
    subtotal += total;
    if (!line.vatIncluded) exVatBase += total;
  }
  const vat = vatOn(exVatBase, vatRate);
  return { subtotalAgorot: subtotal, vatAgorot: vat, totalAgorot: subtotal + vat };
}

/** Format agorot as a Hebrew ILS price, e.g. 690000 -> "‏6,900 ₪". */
export function formatAgorot(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: agorot % 100 === 0 ? 0 : 2,
    minimumFractionDigits: agorot % 100 === 0 ? 0 : 2,
  }).format(agorot / 100);
}
