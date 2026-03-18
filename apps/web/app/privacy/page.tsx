import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description: 'מדיניות הפרטיות של אתר בונים בית.',
  alternates: {
    canonical: 'https://bonimbait.com/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="container-page">
      <article className="pt-12 pb-16 max-w-3xl mx-auto prose-rtl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">מדיניות פרטיות</h1>
        <p className="text-sm text-gray-400 mb-8">עדכון אחרון: מרץ 2026</p>

        <section className="space-y-6 text-gray-600 leading-relaxed">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. מידע כללי</h2>
            <p>
              אתר בונים בית (&quot;האתר&quot;) מופעל כמאגר ידע ציבורי בנושא בנייה פרטית בישראל.
              אנו מחויבים להגנה על פרטיותכם ולשקיפות מלאה לגבי המידע שאנו אוספים.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. מידע שאנו אוספים</h2>
            <p>האתר אינו דורש הרשמה או מסירת פרטים אישיים. המידע שעשוי להיאסף כולל:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>מידע טכני כללי (כתובת IP, סוג דפדפן, מערכת הפעלה)</li>
              <li>דפוסי שימוש באתר (עמודים שנצפו, חיפושים שבוצעו)</li>
              <li>עוגיות (cookies) לצורך תפעול תקין של האתר</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. שימוש במידע</h2>
            <p>המידע שנאסף משמש אך ורק למטרות הבאות:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>שיפור חווית המשתמש ותפקוד האתר</li>
              <li>ניתוח סטטיסטי אנונימי של השימוש באתר</li>
              <li>שיפור תוצאות החיפוש ותשובות ה-AI</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. תוכן צד שלישי</h2>
            <p>
              האתר מציג תוכן וידאו מפלטפורמת יוטיוב. צפייה בסרטונים כפופה
              ל<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">מדיניות הפרטיות של Google</a>.
              סיכומי ה-AI מבוססים על תוכן ציבורי ואינם מהווים ייעוץ מקצועי.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. עוגיות (Cookies)</h2>
            <p>
              האתר עשוי להשתמש בעוגיות טכניות הכרחיות לתפעולו התקין.
              אין שימוש בעוגיות למעקב פרסומי.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. אבטחת מידע</h2>
            <p>
              אנו נוקטים אמצעים סבירים להגנה על המידע הנאסף באתר, כולל הצפנת תקשורת (HTTPS)
              ושמירה על עדכניות מערכות האבטחה.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. שינויים במדיניות</h2>
            <p>
              אנו שומרים לעצמנו את הזכות לעדכן מדיניות זו מעת לעת.
              שינויים מהותיים יפורסמו בעמוד זה עם תאריך העדכון.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. יצירת קשר</h2>
            <p>
              לשאלות בנושא פרטיות, ניתן לפנות אלינו בכתובת{' '}
              <a href="mailto:info@bonimbait.com" className="text-primary hover:underline">info@bonimbait.com</a>.
            </p>
          </div>
        </section>

        <div className="mt-10 pt-6 border-t border-gray-100 text-center">
          <Link
            href="/"
            className="inline-block bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors shadow-md"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </article>
    </div>
  );
}
