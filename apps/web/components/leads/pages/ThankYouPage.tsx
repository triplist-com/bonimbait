import Link from 'next/link';
import WhatsappJoinForm from '@/components/leads/WhatsappJoinForm';

/**
 * /thank-you/ (live template "templates/thank-you.php"). Also rendered for
 * /תודה-על-השארת-פרטים/, which the live site 301s here (seeded redirect).
 * Like the live page, it offers the WhatsApp community join form.
 */
export default function ThankYouPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <section className="mx-auto max-w-2xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="mt-4 text-sm font-semibold text-primary">תודה</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900 sm:text-4xl">תודה רבה על פנייתך!</h1>
        <p className="mt-3 text-lg text-gray-600">נציג שלנו יחזור אליך בהקדם.</p>
        <Link href="/" className="mt-6 inline-block font-medium text-primary hover:text-primary-700">
          חזרה לדף הבית
        </Link>
      </section>

      <div className="mx-auto mt-12 max-w-2xl">
        <WhatsappJoinForm idPrefix="wa-thanks" />
      </div>
    </div>
  );
}
