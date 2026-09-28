import type { Metadata } from 'next';
import Link from 'next/link';
import { absoluteUrl } from '@/lib/site';
import { thankYouMetadata } from '@/lib/special-pages/leads';

export const metadata: Metadata = {
  title: { absolute: 'תודה — שותפים אסטרטגיים - בונים בית' },
  description: 'תודה שפניתם לבונים בית. קיבלנו את הפרטים ונחזור אליכם בהקדם.',
  alternates: { canonical: absoluteUrl('/strategic-partners/thank-you/') },
  ...(thankYouMetadata().robots ? { robots: thankYouMetadata().robots } : {}),
};

const NEXT_STEPS = [
  'אנחנו בודקים את התחום, האזור וההתאמה לשותפות בקהילה.',
  'נחזור אליכם לשיחה קצרה כדי להבין מה נכון לעסק שלכם.',
  'אם יש התאמה, נציג תוכנית שותפות מסודרת וברורה להמשך.',
];

/** /strategic-partners/thank-you/ — live template "template-strategic.php". */
export default function StrategicPartnersThankYouPage() {
  return (
    <div className="container-page py-16 sm:py-24">
      <section className="mx-auto max-w-2xl text-center">
        <p className="inline-block rounded-full bg-green-100 px-4 py-1 text-sm font-semibold text-green-700">
          הפרטים נשלחו בהצלחה
        </p>
        <h1 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">תודה, קיבלנו את הפנייה שלכם.</h1>
        <p className="mt-4 text-lg text-gray-600">
          הצוות של בונים בית יעבור על הפרטים, יבדוק התאמה וזמינות לפי התחום שלכם, ויחזור אליכם בהקדם עם המשך מסודר.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/strategic-partners/" className="rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-700">
            חזרה לדף הנחיתה
          </Link>
          <Link href="/" className="rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-800 hover:bg-gray-50">
            מעבר לפורטל בונים בית
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-2xl rounded-2xl bg-white p-6 shadow-card sm:p-8">
        <h2 className="text-xl font-bold text-gray-900">מה קורה עכשיו?</h2>
        <ol className="mt-4 space-y-4">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary">
                {i + 1}
              </span>
              <p className="pt-1 text-gray-700">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
