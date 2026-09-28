import { formatPrice } from '@/lib/db/commerce';
import type { OrderTotals } from '@/lib/commerce/pricing';

/** Subtotal / VAT / total block used by cart, checkout and order pages. */
export default function OrderSummary({
  totals,
  vatRate,
  hasExVatLines,
}: {
  totals: OrderTotals;
  vatRate: number;
  hasExVatLines: boolean;
}) {
  return (
    <dl className="space-y-2 text-gray-700">
      <div className="flex justify-between">
        <dt>{hasExVatLines ? 'סכום ביניים (לפני מע״מ)' : 'סכום ביניים'}</dt>
        <dd>{formatPrice(totals.subtotalAgorot)}</dd>
      </div>
      {totals.vatAgorot > 0 && (
        <div className="flex justify-between">
          <dt>מע״מ ({Math.round(vatRate * 100)}%)</dt>
          <dd>{formatPrice(totals.vatAgorot)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold text-gray-900">
        <dt>סה״כ לתשלום{hasExVatLines || totals.vatAgorot > 0 ? ' (כולל מע״מ)' : ''}</dt>
        <dd>{formatPrice(totals.totalAgorot)}</dd>
      </div>
    </dl>
  );
}
