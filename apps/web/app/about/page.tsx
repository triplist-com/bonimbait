import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'אודות',
  description:
    'בונים בית הוא מאגר ידע מקיף לבנייה פרטית בישראל. למדו איך המערכת עובדת ואיך לקבל תשובות מבוססות AI לשאלות בנייה.',
  alternates: {
    canonical: 'https://bonimbait.com/about',
  },
};

export default function AboutPage() {
  const steps = [
    {
      num: '1',
      title: 'חפשו שאלה',
      desc: 'הקלידו כל שאלה בנושא בנייה פרטית בישראל',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      num: '2',
      title: 'קבלו תשובת AI',
      desc: 'המערכת מנתחת מאות סרטונים ומחזירה תשובה מדויקת עם מקורות',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      ),
    },
    {
      num: '3',
      title: 'צפו בסרטון',
      desc: 'לחצו על המקור וצפו ישירות ברגע הרלוונטי בסרטון',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="container-page">
      {/* Hero */}
      <section className="pt-16 pb-12 text-center max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
          אודות בונים בית
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          בונים בית הוא מאגר ידע מקיף לבנייה פרטית בישראל. אנחנו מאגדים מאות סרטוני
          יוטיוב בנושא בנייה, מנתחים אותם באמצעות בינה מלאכותית, ומאפשרים לכם לקבל
          תשובות מהירות ומדויקות לכל שאלה.
        </p>
      </section>

      {/* How it works */}
      <section className="py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-10 text-center">
          איך זה עובד?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div
              key={step.num}
              className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-card hover:shadow-card-hover transition-shadow"
            >
              <div className="w-16 h-16 mx-auto mb-5 bg-primary-50 rounded-2xl flex items-center justify-center text-primary">
                {step.icon}
              </div>
              <div className="w-8 h-8 mx-auto mb-3 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
                {step.num}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Attribution */}
      <section className="py-12">
        <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-100 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-4">תודות וקרדיט</h2>
          <p className="text-gray-600 leading-relaxed mb-6">
            כל התוכן מבוסס על סרטוני יוטיוב ציבוריים של יוצרי תוכן מובילים בתחום
            הבנייה הפרטית בישראל. אנחנו מודים ליוצרים על השיתוף והידע.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            המערכת משתמשת בבינה מלאכותית לניתוח וסיכום תכנים. התשובות מבוססות על
            תוכן הסרטונים ואינן מהוות ייעוץ מקצועי.
          </p>
          <Link
            href="/"
            className="inline-block bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors shadow-md"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </section>
    </div>
  );
}
