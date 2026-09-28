import type { OrderStatus } from '@/lib/db/types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'ממתינה לתשלום',
  paid: 'שולמה',
  failed: 'התשלום נכשל',
  cancelled: 'בוטלה',
  refunded: 'זוכתה',
};
