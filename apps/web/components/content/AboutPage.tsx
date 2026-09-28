import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { CONTACT_EMAIL, absoluteUrl } from '@/lib/site';
import Breadcrumbs from './Breadcrumbs';
import ConsultationCTA from '@/components/leads/ConsultationCTA';

/*
 * /אודותינו/. The live page is a PHP template (templates/about.php), so the
 * `pages` row has no content; the copy below is taken from the live page.
 */

const STORY = [
  'בונים בית היא קהילת הבונים והמשפצים הגדולה בישראל. כאשר בניתי את ביתי, גיליתי שבתחום הבניה הפרטית אין בנמצא ידע מקצועי זמין, אין שיתוף, שהשוק פרוץ ועמוס באינטרסים ובניגודי עניינים, ושקיים קושי לאתר בעלי מקצוע וקבלנים מומלצים. מתוך ההבנה שמדובר בפרויקט מורכב ומאתגר, עם אינספור פעילויות, ריבוי משתתפים, סכומי כסף גדולים, ניגודי עניינים, ליקויים וכשלים, נוסדה בונים בית בשנת 2012, במטרה לסייע לבונים ולמשפצים להצליח בפרויקט ולהגשים את חלום הבית הפרטי.',
  'כאן תוכלו למצוא את בעלי המקצוע והספקים הטובים בישראל, שאנו בודקים בקפידה ומעניקים להם ציון על ידי בדיקה מקצועית שלנו ובדיקה מול המלצות הקהילה. בעל מקצוע או ספק שלא עומד בסטנדרטים שלנו לא נמצא במאגר שלנו.',
  'אתר בונים בית, יחד עם כל הפלטפורמות הדיגיטליות שלו, עוזר לכל מי שעתיד לבנות או לשפץ בישראל להגיע לפרויקט עם הידע הנכון. ידע נכון מביא לתוצאות טובות יותר ולחיסכון אדיר בכסף.',
  'אנו נפגשים עם בעלי המקצוע והחברות המובילות בענף הבניה ועם הבונים חברי הקהילה, ונכנסים לעובי הקורה בכל הקשור לבנייה: מדריך ויומן בנייה שעוזר לעבור בהצלחה את תהליך הבניה או השיפוץ.',
  'עם השנים והמומחיות בשוק הבניה בישראל אנו מעניקים שירותי תקציב כהכנה למכרזי קבלנים ושירותי ליווי מלאים, כדי ששלב התכנון יהיה יעיל ככל הניתן וכדי להגיע לשלב הביצוע מוכנים ועם כמה שפחות טעויות: ליווי מלא משלב ההתחלה ועד העלייה לקרקע, ומעקב מתמיד אחרי התכנון שלכם.',
];

const STATS = [
  { value: '16,000', label: 'עוקבים בערוץ היוטיוב הגדול בישראל' },
  { value: '60', label: 'קבוצות וואטסאפ בפריסה ארצית' },
  { value: '40,000', label: 'משפחות בקהילה' },
  { value: '13,000', label: 'עוקבים בדף הפייסבוק' },
];

const SERVICES = [
  { title: 'מדריך בניה שלם', body: 'מדריך בניה שלם לבונים ומשפצים, משלב התכנון ועד לשלב הכניסה לבית', href: '/blog/' },
  { title: 'ערוץ YouTube', body: 'מאות סרטונים ולייבים של הדרכות בתחום הבניה והשיפוצים', href: '/בונים-בית-tv/' },
  { title: 'פודקאסט ולייב', body: 'פרקי פודקאסט שבועיים במגוון תחומי הבניה והשיפוץ', href: '/category/פודקאסט/' },
  { title: 'קבוצות וואטסאפ', body: 'קבוצות של בונים ומשפצים בלבד בכל הארץ, לפי אזור הבניה או השיפוץ שלכם', href: '/הצטרפו-לקבוצות-הווטסאפ/' },
  { title: 'ירידים וכנסים', body: 'כנסים וסדנאות שמתפרסמים באתר מעת לעת לקהילת בונים בית', href: '/category/כנסים-ולייבים/' },
  { title: 'בעלי מקצוע מומלצים', body: 'רק בעלי מקצוע מדורגים שאנחנו סומכים עליהם, עם ציון גבוה מהקהילה ומאיתנו', href: '/recommended/' },
];

const TEAM = [
  {
    name: 'תומר חן ריחאנה',
    bio: 'מתגורר בחדרה, נשוי ואב לשלושה, מייסד מיזם "בונים בית". מהנדס אבטחת מידע בעברו ומומחה בניה בהווה, שעזב את ההייטק לטובת קהל הבונים והמשפצים. מנהל התוכן המקצועי בבונים בית ובערוץ היוטיוב.',
  },
  {
    name: 'צורי גלילי',
    bio: 'עו"ד מקרקעין מחולון, בעל ניסיון רב בניהול פרויקטים בתחום הבניה והשיפוצים. מנהל את הייעוצים האישיים, סדנאות התקציב ותוכניות הליווי והניהול של בונים בית.',
  },
  {
    name: 'מורן יוסיאן',
    bio: 'אחראית על ניהול המשרד בבונים בית, מהנהלת החשבונות ועד שירות הלקוחות. נתקלתם בבעיה? מורן כאן עבורכם.',
  },
];

const TESTIMONIALS = [
  { name: 'מיטל וסקר', text: 'מקום אחד בו אפשר ללמוד ולחקור על תהליך הבנייה מראייה אובייקטיבית. מציג את התהליך באופן שקוף, ברור ומכוון. צוות בונים בית אין עליכם!' },
  { name: 'ליאת מסורי', text: 'ממליצה בחום לכל בונה. עושה סדר בג׳ונגל של עולם הבנייה ומביא מידע מועיל ובאופן נגיש לבונה הפרטי.' },
  { name: 'איתי זיו', text: 'אתר מטורף עם המון מידע שעזר לי המון, בונים פרטיים בקבוצות שעזרו לי. ממליץ לכל מי שבונה ומשפץ להצטרף לקהילה.' },
  { name: 'אביה', text: 'הלוואי והייתי יודעת על קהילת בונים בית בתחילת תהליך תכנון הבית! מאז שאנו בקבוצה, יש עם מי להתייעץ על כל נושא ונושא.' },
  { name: 'אדם עזריה', text: 'בונים בית מלווים אותנו בנושא תקציב הבניה, מאוד מקצועיים ותכליתיים. אחרי הפגישה הראשונה הרגשנו בידיים בטוחות.' },
  { name: 'ניר', text: 'מענה כמעט תמיד מיידי. מקצועי. עזרה ושירות אדיבים ממש.' },
];

export default function AboutPage() {
  return (
    <div className="pb-16">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          url: absoluteUrl('/אודותינו/'),
          mainEntity: { '@type': 'Organization', name: 'בונים בית', foundingDate: '2012', url: absoluteUrl('/') },
        }}
      />
      <header className="hero-bg pt-6 sm:pt-10 pb-12">
        <div className="container-page max-w-5xl">
          <Breadcrumbs
            crumbs={[
              { label: 'ראשי', href: '/' },
              { label: 'אודותינו', href: '/אודותינו/' },
            ]}
          />
          <h1 className="mt-6 text-4xl sm:text-5xl font-bold text-gray-900">אודותינו</h1>
          <p className="mt-4 text-xl text-gray-500 max-w-2xl">
            לסייע לבונים ולמשפצים להצליח בפרויקט הבניה, בדרך של שיתוף ידע ומומחיות מקצועית.
          </p>
        </div>
      </header>

      <div className="container-page max-w-5xl space-y-16">
        <section className="max-w-3xl space-y-5 text-lg leading-relaxed text-gray-700">
          {STORY.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </section>

        <section aria-label="בונים בית במספרים" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white border border-gray-100 shadow-card p-6 text-center">
              <p className="text-3xl font-bold text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-gray-500">{s.label}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="vision">
          <h2 id="vision" className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            החזון של בונים בית
          </h2>
          <p className="text-gray-500 mb-8">שיתוף ידע אונליין ושירות לבונה ולמשפץ</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="group rounded-2xl border border-gray-100 bg-white p-6 hover:border-primary-200 hover:shadow-card-hover transition-all"
              >
                <h3 className="font-bold text-gray-900 group-hover:text-primary mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="team">
          <h2 id="team" className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">
            הצוות שלנו
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {TEAM.map((m) => (
              <div key={m.name} className="rounded-2xl bg-white border border-gray-100 shadow-card p-6">
                <div className="w-14 h-14 rounded-full bg-primary-50 text-primary text-xl font-bold flex items-center justify-center mb-4" aria-hidden="true">
                  {m.name.charAt(0)}
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{m.name}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{m.bio}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-gray-600">
            לשירותכם בכל עת:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary font-medium hover:underline">
              {CONTACT_EMAIL}
            </a>{' '}
            ·{' '}
            <Link href="/צור-קשר/" className="text-primary font-medium hover:underline">
              צור קשר
            </Link>
          </p>
        </section>

        <section aria-labelledby="testimonials">
          <h2 id="testimonials" className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">
            מה אומרים עלינו
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="rounded-2xl bg-white border border-gray-100 p-6">
                <blockquote className="text-gray-700 leading-relaxed">“{t.text}”</blockquote>
                <figcaption className="mt-4 text-sm font-semibold text-gray-900">{t.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <ConsultationCTA variant="banner" source="about" />
      </div>
    </div>
  );
}
