import type { Metadata } from 'next';
import { listSpecialties } from '@/lib/db/businesses';
import { getUser } from '@/lib/auth/session';
import { absoluteUrl } from '@/lib/site';
import { createPublicClient } from '@/lib/directory/server';
import JoinProForm from '@/components/directory/JoinProForm';

// Yoast values of the live page.
const TITLE = 'הרשמה לבעלי מקצוע - בונים בית';
const DESCRIPTION =
  'בעלי מקצוע בעולם השיפוץ הביתי? אנחנו מחפשים בעלי מקצוע אמינים, שייתנו שירות לקהילת "בונים בית". קבלני ביצוע, מעצבים, אדריכלים ועוד. הרשמו >>>';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/join-us/') },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl('/join-us/'), type: 'article', locale: 'he_IL' },
};

const STATS = [
  { value: '50,000+', label: 'גולשים באתר ממוקדי בניה ושיפוץ' },
  { value: '21,000+', label: 'עוקבים בערוץ היוטיוב' },
  { value: '60+', label: 'קבוצות וואטסאפ של בונים בפריסה ארצית' },
  { value: '15,000+', label: 'עוקבים בערוץ ובקבוצת הפייסבוק' },
];

const BENEFITS = [
  'הקמת מיניסייט באתר בונים בית',
  'קבלת דירוג ותו איכות וכניסה למאגר בתי העסק המומלצים שלנו',
  'צילום שטח מקצועי אשר יעלה לפרסום בערוץ היוטיוב של בונים בית',
  'הצעה מיוחדת שלכם עבור רכישה קבוצתית מול הקהילה',
  'קידום העסק ושיווקו ב-60 קבוצות וואטסאפ בפריסה ארצית',
  'ראיון אישי שלכם מול הקהילה בערוץ הפודקאסט של בונים בית',
  'קידום העסק שלכם בניוזלטר של בונים בית עם מעל 20 אלף מנויים',
  'סיור בונים אצלכם בעסק וקידום מכירות פרונטלי במגרש שלכם',
  'כנסים ולייבים במדיה החברתית',
];

const STEPS = ['פונים אלינו בטופס', 'נציג מטעמנו יצור עמכם קשר לקיום בירור צרכים', 'נבחר את המסלול המתאים ביותר עבורכם'];

export default async function JoinUsPage() {
  let specialties: Array<{ id: string; name: string }> = [];
  try {
    specialties = (await listSpecialties(createPublicClient())).map((s) => ({ id: s.id, name: s.name }));
  } catch {
    // Form still works without the optional specialty list.
  }
  const user = await getUser();

  return (
    <div className="pb-16">
      <section className="bg-gradient-to-b from-primary-50 to-transparent">
        <div className="container-page py-12 text-center sm:py-16">
          <p className="font-semibold text-primary">הרשמה לבעלי מקצוע</p>
          <h1 className="mx-auto mt-2 max-w-3xl text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
            הצטרפות בעלי מקצוע וחברות לקהילת בונים בית, קהילת הבונים והמשפצים הגדולה בישראל
          </h1>
          <p className="mt-4 text-lg text-gray-700">רק בעלי מקצוע מדורגים נמצאים אצלנו!</p>
          <p className="mt-1 text-gray-600">חשיפה גדולה לבונים ומשפצים. קידום העסק. יותר פניות. יותר עסקאות!</p>
          <a href="#join-form" className="mt-6 inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-700">
            השאירו פרטים
          </a>
        </div>
      </section>

      <div className="container-page grid gap-12 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-12">
          <section>
            <h2 className="mb-5 text-2xl font-bold text-gray-900">למה כדאי לכם להצטרף לקהילת בונים בית?</h2>
            <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {STATS.map((s) => (
                <li key={s.value} className="rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-card">
                  <p className="text-2xl font-extrabold text-primary" dir="ltr">
                    {s.value}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{s.label}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-gray-900">מי אנחנו?</h2>
            <div className="space-y-3 leading-7 text-gray-700">
              <p>
                חברת בונים בית, קהילת בוני הבתים הפרטיים הגדולה בישראל, נוסדה בשנת 2015 על ידי תומר חן ריחאנה. החברה הוקמה
                מתוך צורך אמיתי לתת מידע, תוכן והכוונה מקצועית לכל מי שמעוניין לבנות את ביתו או להתחיל פרויקט שיפוץ גדול.
              </p>
              <p>
                האתר מעביר לכל בונה את מדריך הבניה השלם בישראל, מקשר אלפי בונים ומשפצים לקבוצות וואטסאפ בכל אזור בישראל
                ומסייע במגוון ייעוצים מקצועיים וניטרליים למאות בונים בשנה. אנו כאן כדי לשנות ולהוביל איכות, אמינות
                ושירות, וכל זה קורה גם בעזרת הקהילה הנפלאה!
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900">איך תקדמו את העסק שלי?</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <li key={b} className="flex gap-2 rounded-xl bg-white p-3 text-gray-700 shadow-card">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900">איך זה עובד?</h2>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
                  <span className="text-3xl font-extrabold text-primary-200">{String(i + 1).padStart(2, '0')}</span>
                  <p className="mt-2 font-medium text-gray-800">{s}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-center text-lg font-bold text-gray-900">חשיפה. פניות. הצלחה!</p>
          </section>
        </div>

        <aside id="join-form" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
            <h2 className="mb-4 text-xl font-bold text-gray-900">השאירו פרטים וניצור עמכם קשר בהקדם!</h2>
            <JoinProForm specialties={specialties} signedIn={!!user} />
          </div>
        </aside>
      </div>
    </div>
  );
}
