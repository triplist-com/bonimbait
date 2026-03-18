import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'תנאי שימוש',
  description: 'תנאי השימוש של אתר בונים בית.',
  alternates: {
    canonical: 'https://bonimbait.com/terms',
  },
};

export default function TermsPage() {
  return (
    <div className="container-page">
      <article className="pt-12 pb-16 max-w-3xl mx-auto prose-rtl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">תנאי שימוש</h1>
        <p className="text-sm text-gray-400 mb-8">עדכון אחרון: מרץ 2026</p>

        <section className="space-y-6 text-gray-600 leading-relaxed">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. כללי</h2>
            <p>
              ברוכים הבאים לאתר בונים בית (&quot;האתר&quot;). השימוש באתר כפוף לתנאים המפורטים להלן.
              גלישה באתר מהווה הסכמה לתנאים אלה.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. מטרת האתר</h2>
            <p>
              האתר מספק מאגר ידע בנושא בנייה פרטית בישראל, המבוסס על ניתוח סרטוני יוטיוב ציבוריים
              באמצעות בינה מלאכותית. האתר נועד למטרות מידע כלליות בלבד.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. הגבלת אחריות</h2>
            <p>
              המידע באתר, כולל סיכומי AI, עלויות, וטיפים, מוצג כפי שהוא (&quot;AS IS&quot;)
              ואינו מהווה ייעוץ מקצועי, משפטי, הנדסי או אחר.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>מומלץ תמיד להתייעץ עם בעלי מקצוע מוסמכים לפני קבלת החלטות</li>
              <li>מחירים ועלויות המוצגים באתר הם הערכות בלבד ועשויים להשתנות</li>
              <li>האתר אינו אחראי לנזק ישיר או עקיף הנובע מהסתמכות על תוכן האתר</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. זכויות יוצרים</h2>
            <p>
              תוכן הווידאו המוצג באתר שייך ליוצרי התוכן המקוריים ביוטיוב.
              האתר מציג סיכומים ומטא-דאטה שנוצרו באמצעות AI ואינו מציג או מפיץ
              את תוכן הווידאו עצמו מעבר לשימוש ההוגן.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. שימוש באתר</h2>
            <p>השימוש באתר מותר למטרות אישיות ולא מסחריות. אין:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>לגרד (scrape) את תוכן האתר באופן אוטומטי ללא אישור</li>
              <li>להשתמש באתר לפעולות בלתי חוקיות</li>
              <li>לנסות לפגוע בתשתיות האתר או אבטחתו</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. שינויים בתנאים</h2>
            <p>
              אנו שומרים לעצמנו את הזכות לשנות תנאים אלה בכל עת.
              שינויים ייכנסו לתוקף עם פרסומם בעמוד זה.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. יצירת קשר</h2>
            <p>
              לשאלות בנושא תנאי השימוש, ניתן לפנות אלינו בכתובת{' '}
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
