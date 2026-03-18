import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'צור קשר',
  description: 'צרו קשר עם צוות בונים בית לשאלות, הצעות, או שיתופי פעולה.',
  alternates: {
    canonical: 'https://bonimbait.com/contact',
  },
};

export default function ContactPage() {
  return (
    <div className="container-page">
      <section className="pt-16 pb-12 text-center max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
          צור קשר
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          יש לכם שאלה, הצעה, או רוצים לשתף פעולה? נשמח לשמוע מכם.
        </p>
      </section>

      <section className="pb-16 max-w-2xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {/* Email */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-card">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary-50 rounded-2xl flex items-center justify-center text-primary">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">אימייל</h2>
            <a
              href="mailto:info@bonimbait.com"
              className="text-primary hover:text-primary-700 font-medium transition-colors"
            >
              info@bonimbait.com
            </a>
          </div>

          {/* General Info */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center shadow-card">
            <div className="w-14 h-14 mx-auto mb-4 bg-primary-50 rounded-2xl flex items-center justify-center text-primary">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">מידע כללי</h2>
            <p className="text-sm text-gray-500">
              אנחנו בדרך כלל חוזרים תוך 48 שעות
            </p>
          </div>
        </div>

        {/* FAQ-like section */}
        <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-100 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-3">שאלות נפוצות</h2>
          <div className="text-start space-y-4 text-sm text-gray-600 max-w-lg mx-auto">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">איך מוסיפים סרטון לאתר?</h3>
              <p>כרגע המערכת מאגדת סרטונים אוטומטית מערוצי יוטיוב מובילים בתחום הבנייה. אם יש לכם ערוץ רלוונטי, שלחו לנו אימייל.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">האם התשובות של ה-AI מדויקות?</h3>
              <p>תשובות ה-AI מבוססות על תוכן הסרטונים ואינן מהוות ייעוץ מקצועי. מומלץ תמיד להתייעץ עם איש מקצוע.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">רוצה לדווח על תוכן שגוי?</h3>
              <p>שלחו לנו אימייל עם קישור לעמוד הרלוונטי ונטפל בכך בהקדם.</p>
            </div>
          </div>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors shadow-md"
            >
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
