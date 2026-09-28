import Link from 'next/link';
import { WhatsAppChatButton } from '@/components/leads/ConsultationCTA';

/** /תודה-על-השארת-פרטים-מוצר/ — live Elementor page 66850 (after benefit/product forms). */
export default function ThankYouProductPage() {
  return (
    <div className="container-page py-16 sm:py-24">
      <section className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-card sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">תודה שיצרת קשר!</h1>
        <p className="mt-2 text-lg text-gray-600">נחזור אליכם בהקדם</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="rounded-xl bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-700"
          >
            חזרה לאתר
          </Link>
          <WhatsAppChatButton label="דברו עם בונים בית" message="היי, השארתי פרטים באתר ואשמח לדבר" />
        </div>
      </section>
    </div>
  );
}
