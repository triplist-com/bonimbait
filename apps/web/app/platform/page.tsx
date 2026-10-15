import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'סקירה' };

/** Placeholder home of the pitch site; the pitch squad (Wave B) replaces it. */
export default function PlatformHomePage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <p className="text-sm font-semibold text-primary-700">בונים בית · פלטפורמה</p>
      <h1 className="mt-2 max-w-3xl text-3xl font-bold text-gray-900 sm:text-4xl">מערכת ההפעלה לבניית בית פרטי בישראל</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-600">
        יועץ חכם שמבוסס על הסרטונים, הפודקאסטים והמאמרים של בונים בית, מסלול בנייה אישי לכל בונה, וכל שאלה או לחיצה הופכות לליד מסווג, מנותב
        ומדיד.
      </p>
      <div className="mt-8">
        <Link
          href="/platform/demo/"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          לכל ההדגמות
          <span aria-hidden="true">←</span>
        </Link>
      </div>
    </div>
  );
}
