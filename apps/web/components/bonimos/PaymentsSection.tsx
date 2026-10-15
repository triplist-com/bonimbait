import { ChevronDown, Receipt } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { approvalCounts, isOpenStatus, sortRequests } from '@/lib/bonimos/approvals';
import type { ManagedProjectData } from '@/lib/bonimos/types';
import { NewPaymentRequestButton, PaymentRequestCard } from './PaymentControls';
import { OsSection } from './parts';

const FLOW = ['הבקשה נרשמת', 'מנהל הפרויקט בודק באתר', 'הלקוח מאשר', 'שולם ונרשם בתקציב'] as const;

/**
 * אישורי תשלום: a contractor's payment request is reviewed by the project
 * manager, then approved by the client; every step is kept in the request's
 * log. A workflow and a record, not a payment: the money still goes from the
 * client to the contractor as usual. Server-safe shell; cards are client leaves.
 */
export function PaymentsSection({ data }: { data: ManagedProjectData }) {
  const role = data.viewer.role;
  const sorted = sortRequests(data.payments, role);
  const open = sorted.filter((r) => isOpenStatus(r.status));
  const closed = sorted.filter((r) => !isOpenStatus(r.status));
  const counts = approvalCounts(data.payments);
  const isManager = role === 'manager';

  return (
    <OsSection
      id="payments"
      icon={<Receipt />}
      title="אישורי תשלום"
      subtitle={
        isManager
          ? 'קבלן מבקש תשלום, אתם בודקים שהעבודה בוצעה ושהסכום תואם לחוזה, והלקוח מאשר. כל צעד נשמר.'
          : 'כל בקשת תשלום של קבלן עוברת קודם בדיקה של מנהל הפרויקט, ורק אז מגיעה לאישור שלכם. את הכסף עצמו מעבירים לקבלן כרגיל.'
      }
      action={<NewPaymentRequestButton data={data} />}
    >
      <ol className="mb-4 grid grid-cols-2 gap-1.5 text-caption sm:grid-cols-4" aria-label="שלבי האישור">
        {FLOW.map((step, i) => (
          <li key={step} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-ink-700 ring-1 ring-inset ring-ink-100">
            <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-2xs font-bold text-white">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {data.payments.length > 0 && (
        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-700" aria-live="polite">
          <span>
            ממתינות לבדיקת המנהל: <strong className="num font-bold text-ink-900">{counts.pendingReview}</strong>
          </span>
          <span>
            ממתינות לאישור הלקוח: <strong className="num font-bold text-ink-900">{counts.pendingClient}</strong>
          </span>
          <span>
            אושרו וממתינות לתשלום: <strong className="num font-bold text-ink-900">{counts.approvedUnpaid}</strong>
          </span>
        </p>
      )}

      {open.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<Receipt />}
          title={data.payments.length ? 'אין בקשות פתוחות' : 'עוד אין בקשות תשלום'}
          description={
            isManager
              ? 'כשקבלן שולח דרישת תשלום, רשמו אותה כאן עם החשבון שלו. אחרי הבדיקה באתר היא עוברת לאישור הלקוח.'
              : 'כשקבלן יבקש תשלום, הבקשה תגיע לכאן אחרי שמנהל הפרויקט יבדוק אותה, ותאשרו בלחיצה.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {open.map((r) => (
            <li key={r.id}>
              <PaymentRequestCard request={r} data={data} />
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <details className="group/closed mt-4 rounded-2xl border border-ink-100">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-body-sm font-semibold text-ink-800 [&::-webkit-details-marker]:hidden">
            <span>
              בקשות שהסתיימו (<span className="num">{closed.length}</span>)
            </span>
            <ChevronDown aria-hidden="true" className="size-4 text-ink-500 transition-transform group-open/closed:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-ink-100 p-3">
            {closed.map((r) => (
              <li key={r.id}>
                <PaymentRequestCard request={r} data={data} compact />
              </li>
            ))}
          </ul>
        </details>
      )}
    </OsSection>
  );
}
