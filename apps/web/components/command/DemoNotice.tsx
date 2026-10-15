import Link from 'next/link';
import { FlaskConical, Info } from 'lucide-react';

/** Shown on admin screens rendering demo data: it must never pass for the owner's real numbers. */
export function DemoNotice({ exitHref }: { exitHref: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sand-200 bg-sand-50 px-4 py-3 text-sm text-sand-800">
      <p className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-bold">נתוני הדגמה.</strong> כל המספרים, הלידים והשותפים כאן לדוגמה, כדי לראות איך המסך נראה כשיש תנועה.
        </span>
      </p>
      <Link href={exitHref} className="font-semibold text-ink-900 underline underline-offset-2 hover:text-primary-700">
        חזרה לנתונים האמיתיים
      </Link>
    </div>
  );
}

/** Offered when real data is still sparse. */
export function DemoOffer({ href }: { href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-sm shadow-xs">
      <p className="flex items-start gap-2 text-ink-700">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden="true" />
        <span>עוד אין כאן מספיק תנועה כדי לקרוא מגמות. רוצים לראות איך המסך נראה עם נתונים?</span>
      </p>
      <Link
        href={href}
        className="inline-flex h-9 items-center rounded-xl border border-ink-200 bg-white px-3 font-semibold text-ink-900 hover:border-ink-300 hover:bg-ink-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        הצג נתוני הדגמה
      </Link>
    </div>
  );
}
