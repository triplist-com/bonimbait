import LeadForm from '@/components/leads/LeadForm';
import StrategicRoiCalculator from '@/components/leads/StrategicRoiCalculator';
import { PARTNER_FIELDS } from '@/lib/leads/fields';
import { SITE_CONTACT, telHref } from '@/lib/leads/constants';

/**
 * /strategic-partners/ — live template "template-strategic.php"
 * ("בונים בית | קייס סטאדי עם יחס המרה של 25%"). Content reproduced from the
 * crawl; the professionals' photos and portal screenshots are not migrated
 * (served from /strategic-partners-assets/ on the live host).
 */

const PARTNER_WHATSAPP = '972544300202'; // live "שלחו הודעה ב-WhatsApp" on this page

const HERO_STATS = [
  { value: '20K', label: 'גולשים בפורטל' },
  { value: '23K', label: 'מנויים' },
  { value: '60', label: 'פרויקטים' },
];

const EXPOSURE = [
  { value: '20,000', label: 'גולשים בפורטל בחודש', text: 'מחפשים מדריכים, המלצות ופתרונות - ומוצאים את השותפים שלנו.' },
  { value: '10,000+', label: 'חברי קהילות WhatsApp', text: 'שואלים, מתייעצים ומבקשים המלצות מספקים שהם יכולים לסמוך עליהם.' },
  { value: '5,000', label: 'צפיות ממוצעות לפרק פודקאסט', text: 'הפודקאסט המוביל לבנייה בישראל - YouTube + Spotify.' },
];

const CAMPAIGNS_BAD = [
  'משלמים לגוגל ופייסבוק על קליקים שלא תמיד מגיעים מאנשים בשלב הבחירה.',
  'נלחמים על תשומת לב של שנייה מול כ-15 מפרסמים על אותו מסך.',
  'לידים קרים שצריך לחמם, לשכנע ולרדוף אחריהם שבועות.',
  'הלקוח רואה פרסומת - ומייד חושד. אפס אמון מהרגע הראשון.',
];
const COMMUNITY_GOOD = [
  'עלות חודשית קבועה, חשיפה לאנשים שנמצאים בתהליך בחירת ספקים - בלי הפתעות.',
  'נוכחות ממוקדת בקטגוריה - פחות רעש ויותר התאמה לקהל הנכון.',
  'הלקוח מגיע אליכם עם אמון מובנה - כי הקהילה המליצה עליכם.',
  'נתפסים כמומחי הקטגוריה - בזכות תוכן, פודקאסט והמלצות בשטח.',
];

const PROS: Array<[string, string]> = [
  ['יעל', 'מעצבת פנים'], ['אבישי', 'קבלן בניין'], ['טל', 'אדריכלית נוף'], ['ניר', 'יועץ קרקע'],
  ['פולינה', 'מעצבת פנים'], ['רון', 'יועץ בטיחות ואינסטלציה'], ['גיל', 'קבלן בניין'], ['דנה', 'מעצבת פנים'],
  ['נועם', 'יועץ מיזוג'], ['שחר', 'בדק בית'], ['לירז', 'מעצבת פנים'], ['רביד', 'קבלן בית חכם'],
  ['ניר', 'קבלן פרגולות וגדרות'], ['מירי', 'מעצבת פנים'], ['יוסי', 'קבלן בניין'], ['מישל', 'קבלן איטום'],
  ['שריי', 'יועצת משכנתאות'], ['ניר', 'מעצב פנים'], ['הילה', 'אדריכלית'], ['אלון', 'מיזוג אוויר'],
  ['דניאל', 'אינסטלטור'], ['אבי', 'צבע וגמר'], ['ערן', 'חשמלאי'], ['עומר', 'אדריכל נוף'],
];

const TESTIMONIALS = [
  ['בחודשיים עם בונים בית קיבלנו יותר פניות איכותיות ממה שכל הקמפיינים הדיגיטליים הביאו בשנה. הלקוחות הגיעו עם צורך ברור וידע בסיסי על השירות.', 'רונן כהן', 'מנהל שיווק, פז-גז'],
  ['הפניות מבונים בית היו ממוקדות יותר ממה שהכרנו בקמפיינים רגילים. אנשים הגיעו אחרי שפגשו המלצה ותוכן, והשיחות התחילו ממקום הרבה יותר מקצועי.', 'אייל ברוש', 'סמנכ"ל מכירות, קליל תעשיות'],
  ['הצוות של בונים בית ניהל הכל - מהצילומים דרך כתיבת התוכן ועד ההפצה. אנחנו הבאנו את המקצועיות, והם תרגמו אותה לנוכחות ברורה מול הקהילה.', 'דנה לוי', 'מנהלת פיתוח עסקי, נירלט'],
  ["הפודקאסט שהפיקו לנו עזר להסביר את הערך שלנו בצורה עמוקה. אנשים מתקשרים ואומרים 'שמענו אתכם בבונים בית' - והשיחה מתחילה ממקום אחר.", 'יוסי מזרחי', 'מנכ"ל, תדיראן מיזוג אוויר'],
  ['מאז שהצטרפנו לבונים בית, יש לנו רצף פניות מאנשים שכבר מבינים מה אנחנו מציעים. זה חוסך לנו הרבה זמן בהסברים הראשונים.', 'שרון אביטל', 'בעלים, אביטל מטבחים'],
  ['הנוכחות בתוך האקוסיסטם נתנה לנו בידול אמיתי. לקוחות שפנו אלינו כבר הכירו את המותג והגיעו עם שאלות הרבה יותר מדויקות.', 'מיכאל דוד', 'מנהל מכירות, אלוני אריחים'],
  ['ההמלצות של המפקחים בשטח משמעותיות מאוד. כשלקוח שומע עלינו ממי שמלווה את הבנייה שלו, הוא מגיע לשיחה עם רמת אמון גבוהה יותר.', 'עמית גולן', 'מנכ"ל, גולן חלונות'],
  ['התוכן שהפיקו לנו - הפודקאסט, הסרטונים והמאמרים - מסביר את הערך שלנו גם לפני שיחה ראשונה. לקוחות קוראים את המדריך בפורטל ומתקשרים עם ידע מקדים.', 'נועה שמעוני', "סמנכ\"לית שיווק, סולאר אדג'"],
  ['עברנו מפניות כלליות לפניות הרבה יותר רלוונטיות דרך בונים בית. ההבדל הוא שהאנשים כאן מגיעים אחרי תהליך למידה קצר, ולכן השיחה ממוקדת יותר.', 'אורי פלד', 'בעלים, פלד אינסטלציה'],
] as const;

const SHOWCASE = [
  'עמוד ההטבות', 'בלוג', 'דוח הכנסות ולידים', 'באנרים בעמוד הבלוג',
  'פודקאסט', 'יוטיוב', 'באנרים בעמודים עסקיים באתר', 'באנרים בעמוד הבית',
];

const COMMUNITY_QUOTES: Array<[string, string]> = [
  ['בוקר טוב, גם מחפש מסגר, יכולים להעלות תמונות של עבודות?', '8:41'],
  ['צריכים טובים. מחפש איש מזגנים רציני ומקצועי להתקנה בבית חדש.', '14:17'],
  ['יש המלצות לספק ומתכנן שיש באזור פרדס חנה, חדרה ועמק חפר?', '18:31'],
  ['מחפש קבלן שלד אמין באזור השרון. אשמח להמלצות.', '9:15'],
  ['מי מכיר חשמלאי טוב? עושים לנו חידוש חשמל בבית ישן.', '10:02'],
  ['מחפשת אדריכל לתכנון בית פרטי עם דגש על ניצול שטח.', '11:26'],
  ['מחפש מומחה לאיטום גגות, יש לי נזילות אחרי הגשמים.', '12:05'],
  ['יש למישהו ניסיון עם בנייה קלה? מעניין לשמוע המלצות וחוות דעת.', '15:48'],
  ['מחפש מתקין פרקט טוב, רצוי באזור נתניה והסביבה.', '16:33'],
];

const PROCESS = [
  ['אפיון', 'יושבים ביחד, לומדים את העסק שלכם', 'פגישת אסטרטגיה, זיהוי ההצעה הייחודית שלכם, ובניית עמוד נחיתה + הטבה ייעודית בתוך הפורטל. אתם נכנסים לאקוסיסטם.'],
  ['הפקה', 'מצלמים, כותבים ומפיקים - הכל אצלנו', 'פרק פודקאסט ייעודי, סרטוני Reels, מאמרי תוכן מקצועיים. אנחנו מפיקים תוכן שגורם ללקוחות לסמוך עליכם לפני שהם בכלל מתקשרים.'],
  ['השקה', 'התוכן עולה לאוויר - והפניות מתחילות להגיע', 'שליחה לקהילות WhatsApp, פרסום בפורטל, והמפקחים שלנו מתחילים להמליץ עליכם פיזית בפגישות תקציב ובשטח.'],
  ['מנוע עובד', 'מערך חשיפה ופניות קבוע + אופטימיזציה', 'המערך פעיל. פניות רלוונטיות מגיעות לאורך זמן, ואנחנו ממשיכים לשפר, למדוד ולחדד את הביצועים שלכם בפורטל.'],
] as const;

const PACKAGES = [
  ['חברים', '490'],
  ['שותפים', '1,490'],
  ['שגרירים', '2,990'],
] as const;

const REASONS = [
  ['קהל שנמצא בשלב בחירה', 'אנשים שנמצאים בשלבי תכנון, רכישה ובחירת ספקים. הם מחפשים להבין מי מתאים להם, מה ההבדלים בין האפשרויות, ועל מי אפשר לסמוך.'],
  ['אנחנו עושים הכל בשבילכם', 'צילום, עריכה, כתיבה, הפקה, הפצה. אתם מביאים את המומחיות - אנחנו הופכים אותה לתוכן שמסביר את הערך שלכם.'],
  ['אמון מובנה מהרגע הראשון', 'אנחנו לא מקבלים כל ספק. הלקוחות שלנו יודעים שנוכחות בבונים בית עוברת בדיקה. הם מגיעים לשיחה כשהם כבר מבינים את הערך.'],
] as const;

const FAQ = [
  ['איך אתם מוודאים שרק ספקים איכותיים נכנסים?', 'הנכס הכי יקר שלנו הוא אמון הקהילה - ואנחנו לא מסכנים אותו. לפני כניסה לשותפות, אנחנו בודקים המלצות, בוחנים את המוצר או השירות, ועושים תיאום ציפיות מפורט. רק ספקים שאנחנו באמת מוכנים להמליץ עליהם מצטרפים. זה מה שהופך את ה"תו תקן" שלנו לכל כך חזק.'],
  ['מה זה אומר "הפניית לקוחות פרונטלית"?', 'במסלולי VIP, אתם הופכים ל"ספק הבית" שלנו. מה זה אומר בפועל? מפקחי הבנייה ומנהלי הפרויקטים שלנו מציגים את המוצרים שלכם פיזית - בפגישות תקציב, בכתיבת מכרזים, ובשטח מול לקוחות שמשלמים לנו על ניהול בנייה מלא. זו המלצה פנים-אל-פנים, לא באנר באינטרנט.'],
  ['כמה לידים אפשר לצפות לקבל?', 'אין התחייבות לכמות לידים. הפלטפורמה מיועדת לייצר חשיפה מול קהל רלוונטי של אנשים שבונים, משפצים או מחפשים בעלי מקצוע, ולכן כמות הפניות יכולה להשתנות לפי קטגוריה, אזור, ביקוש, איכות ההצעה והפעילות הפרסומית. המטרה היא לבנות נוכחות נכונה מול קהל בשל, למדוד את הביצועים ולשפר לאורך הדרך.'],
  ['מה קורה אם הקטגוריה שלי כבר תפוסה?', 'זו בדיוק הסיבה לפנות עכשיו. בחלק מהקטגוריות אנחנו מגבילים את מספר השותפים כדי לשמור על איכות ההמלצה ועל בהירות מול הקהל. אם הקטגוריה שלכם תפוסה, נוכל לבדוק תת-קטגוריה ייעודית או אפשרות להצטרף בהמשך.'],
  ['האם אתם עובדים עם מתחרים ישירים?', 'אנחנו בוחנים כל קטגוריה לגופה ומקפידים לא ליצור עומס או בלבול מול הקהל. המטרה היא לשמור על איכות ההמלצה, על התאמה מקצועית ועל נוכחות ברורה לכל שותף לפי התחום והאזור שלו.'],
  ['מה ההבדל בינכם לבין פרסום רגיל בגוגל?', 'ההבדל הוא מהותי. בגוגל אתם משלמים על קליקים - רבים מהם קרים או לא רלוונטיים, ואתם מתחרים מול כ-15 מפרסמים על אותו מסך. אצלנו הלקוח מגיע אחרי שפגש תוכן, המלצה או נוכחות מקצועית בתוך האקוסיסטם של בונים בית. הקייס סטאדי הראה יחס המרה של 25%. ועוד דבר: בגוגל כשתפסיקו לשלם - תפסיקו לקבל. אצלנו - התוכן, המוניטין והנוכחות ממשיכים לעבוד לאורך זמן.'],
] as const;

function SectionTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 text-gray-600">{intro}</p>}
    </div>
  );
}

export default function StrategicPartnersPage() {
  const waHref = `https://wa.me/${PARTNER_WHATSAPP}?text=${encodeURIComponent('היי, אשמח לבדוק אם הקטגוריה שלי פנויה')}`;
  return (
    <div className="pb-16">
      {/* Hero */}
      <section className="bg-gray-950 text-white">
        <div className="container-page py-16 text-center sm:py-24">
          <h1 className="text-5xl font-black leading-[0.95] sm:text-7xl">
            <span className="block">200 לידים.</span>
            <span className="block">50 סגירות.</span>
            <span className="block text-[#ff6baa]">חודשיים.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-gray-300">
            עשרות אלפי בונים ומשפצים מגיעים אלינו כשהם מחפשים ספקים שהם יכולים לסמוך עליהם. שותפות עם בונים בית מציבה
            אתכם בתוך רגעי הבחירה שלהם.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#partner-form" className="rounded-xl bg-[#fc3565] px-6 py-3 font-semibold text-white hover:brightness-110">
              בדקו אם הקטגוריה פנויה
            </a>
            <a href="#showcase" className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10">
              ראו איך זה נראה בפועל
            </a>
          </div>
          <p className="mt-10 font-semibold">הנוכחות שלכם בתוך הפורטל, לא לידו</p>
          <p className="text-sm text-gray-400">באנרים, תוכן, הטבות ונקודות פנייה בתוך מסע הבחירה של הקהילה.</p>
          <dl className="mx-auto mt-8 grid max-w-xl grid-cols-3 gap-4">
            {HERO_STATS.map((s) => (
              <div key={s.label}>
                <dd className="text-3xl font-black sm:text-4xl" dir="ltr">{s.value}</dd>
                <dt className="mt-1 text-xs text-gray-400">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Exposure */}
      <section className="container-page mt-16">
        <SectionTitle
          title="הקהילה והחשיפה בפועל"
          intro="בונים ומשפצים שנמצאים בשלבי תכנון, רכישה ובחירת ספקים פוגשים את התוכן, הקהילה וההמלצות של בונים בית. ככה נראית החשיפה שהשותפים שלנו מקבלים:"
        />
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {EXPOSURE.map((e) => (
            <div key={e.label} className="rounded-2xl bg-white p-6 text-center shadow-card">
              <p className="text-5xl font-black text-gray-900" dir="ltr">{e.value}</p>
              <p className="mt-2 font-bold text-gray-800">{e.label}</p>
              <p className="mt-1 text-sm text-gray-500">{e.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Campaigns vs community */}
      <section className="container-page mt-16">
        <SectionTitle
          title="למה לא כל קמפיין מביא פניות איכותיות - ומה כן"
          intro="קליקים קרים לא תמיד מבשילים לפנייה איכותית. בתוך קהילה מקצועית, הלקוח פוגש אתכם בהקשר שבו כבר יש אמון."
        />
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-6">
            <h3 className="text-lg font-bold text-gray-900">קמפיינים בלי הקשר קהילתי</h3>
            <ul className="mt-3 space-y-2 text-gray-700">
              {CAMPAIGNS_BAD.map((t) => (
                <li key={t} className="flex gap-2"><span aria-hidden="true" className="text-red-500">✕</span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-green-100 bg-green-50/50 p-6">
            <h3 className="text-lg font-bold text-gray-900">להיות ספק הבית של הקהילה</h3>
            <ul className="mt-3 space-y-2 text-gray-700">
              {COMMUNITY_GOOD.map((t) => (
                <li key={t} className="flex gap-2"><span aria-hidden="true" className="text-green-600">✓</span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Professionals */}
      <section className="container-page mt-16">
        <SectionTitle title="כאן הבונים פוגשים את בעלי המקצוע" />
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {PROS.map(([name, role], i) => (
            <li key={`${name}-${i}`} className="rounded-xl bg-white p-3 text-center shadow-card">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 font-bold text-primary" aria-hidden="true">
                {name.charAt(0)}
              </span>
              <p className="mt-2 font-semibold text-gray-900">{name}</p>
              <p className="text-xs text-gray-500">{role}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Case study */}
      <section className="container-page mt-16">
        <div className="rounded-3xl bg-gradient-to-l from-primary-700 to-primary-600 p-8 text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">קייס סטאדי: פז-גז x בונים בית</h2>
          <p className="mt-3 max-w-3xl text-primary-100">
            חודשיים של שותפות. מודול הטבות + נוכחות בפורטל. התוצאות ממחישות מה קורה כשפוגשים קהל רלוונטי בתוך סביבה שכבר
            בנתה אמון:
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <li className="rounded-2xl bg-white/10 p-5"><strong className="text-2xl">200+</strong> פניות מלקוחות שביקשו הצעת מחיר ביוזמתם.</li>
            <li className="rounded-2xl bg-white/10 p-5"><strong className="text-2xl">25%</strong> הקייס סטאדי הראה יחס המרה של 25%.</li>
            <li className="rounded-2xl bg-white/10 p-5"><strong className="text-2xl">×3</strong> עלות גיוס לקוח (CAC) נמוכה פי 3 מקמפיינים רגילים.</li>
          </ul>
          <p className="mt-6 text-lg font-semibold">50 עסקאות מתוך 200 לידים בחודשיים בלבד</p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container-page mt-16">
        <SectionTitle
          title="מה אומרים השותפים שלנו"
          intro="ספקים ומותגים מובילים שכבר הצטרפו לאקוסיסטם - והתוצאות מדברות בעד עצמן."
        />
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TESTIMONIALS.map(([quote, name, role]) => (
            <figure key={name} className="rounded-2xl bg-white p-6 shadow-card">
              <blockquote className="text-gray-700">&quot;{quote}&quot;</blockquote>
              <figcaption className="mt-4">
                <p className="font-bold text-gray-900">{name}</p>
                <p className="text-sm text-gray-500">{role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Showcase */}
      <section id="showcase" className="container-page mt-16 scroll-mt-24">
        <SectionTitle
          title="ככה זה נראה בפועל"
          intro='השותפים שלנו לא מקבלים רק "הבטחות" - הם מקבלים נוכחות אמיתית בפורטל, בתוכן, באזור ההטבות ובמאמרים. הנה דוגמאות אמיתיות מהפורטל הפעיל שלנו:'
        />
        <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {SHOWCASE.map((s) => (
            <li key={s} className="rounded-xl border border-gray-100 bg-white p-4 text-center font-medium text-gray-800 shadow-card">{s}</li>
          ))}
        </ul>
      </section>

      {/* Calculator */}
      <section className="container-page mt-16">
        <SectionTitle
          title="כמה שווה לכם הקהל שלנו?"
          intro="הזינו את המספרים שלכם וקבלו הערכה ראשונית לפי נתוני קייס סטאדי. התוצאה בפועל תלויה בקטגוריה, ביקוש ואיכות ההצעה."
        />
        <div className="mx-auto mt-8 max-w-4xl">
          <StrategicRoiCalculator />
        </div>
      </section>

      {/* Community quotes */}
      <section className="container-page mt-16">
        <SectionTitle title="המלצות מהקהילה" intro="שואלים, מתייעצים, בונים יחד" />
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMUNITY_QUOTES.map(([text, time]) => (
            <li key={text} className="rounded-2xl rounded-ss-none bg-[#dcf8c6] p-4 text-gray-800 shadow-card">
              <p>{text}</p>
              <p className="mt-1 text-end text-xs text-gray-500" dir="ltr">{time}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Process */}
      <section className="container-page mt-16">
        <SectionTitle
          title={'מהרגע שתגידו "כן" - ועד הפנייה הראשונה'}
          intro="אנחנו מנהלים את התהליך. אתם מביאים את המומחיות - אנחנו בונים לכם מערך חשיפה ופניות."
        />
        <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-4">
          {PROCESS.map(([step, title, text], i) => (
            <li key={step} className="rounded-2xl bg-white p-6 shadow-card">
              <p className="text-sm font-semibold text-primary">{i + 1}. {step}</p>
              <h3 className="mt-1 font-bold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Packages + form */}
      <section id="partner-form" className="container-page mt-16 scroll-mt-24">
        <SectionTitle
          title="3 חבילות שותפות - בחרו את שלכם"
          intro="כל חבילה בנויה לחשיפה מדויקת מול בונים ומשפצים, עם נוכחות, תוכן וחיבורים לפי רמת הפעילות שמתאימה לכם."
        />
        <div className="mx-auto mt-8 grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-card sm:p-8">
            <p className="text-gray-600">השקעה חודשית מתחילה מ-</p>
            <p className="text-5xl font-black text-gray-900">
              490 <span className="text-2xl">₪</span> <span className="text-base font-medium text-gray-500">/ לחודש</span>
            </p>
            <ul className="mt-6 space-y-3">
              {PACKAGES.map(([name, price]) => (
                <li key={name} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="font-semibold text-gray-900">{name}</span>
                  <span className="text-gray-700">{price} ₪ / לחודש</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-gray-500">צרו קשר לפרטים מלאים</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8">
            <h3 className="text-xl font-bold text-gray-900">מתאים לכם? השאירו פרטים ונתחיל</h3>
            <p className="mt-1 text-gray-600">נבנה לכם תוכנית שותפות מותאמת לעסק שלכם</p>
            <LeadForm
              className="mt-5"
              type="partner"
              fields={PARTNER_FIELDS}
              submitLabel="שלחו פרטים - נחזור אליכם תוך 24 שעות"
              successRedirect="/strategic-partners/thank-you/"
              footnote="בדיקת התאמה ללא עלות | נחזור בהקדם"
              idPrefix="partner"
            />
          </div>
        </div>
      </section>

      {/* Reasons */}
      <section className="container-page mt-16">
        <SectionTitle
          title="3 סיבות שהשותפות הזו עובדת"
          intro="לא סתם עוד פלטפורמת פרסום. הנה למה שותפי בונים בית מקבלים תוצאות שאי אפשר להשיג במקום אחר."
        />
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {REASONS.map(([title, text]) => (
            <div key={title} className="rounded-2xl bg-white p-6 shadow-card">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="mt-2 text-gray-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="container-page mt-16 max-w-3xl">
        <SectionTitle title="יש לכם שאלות - יש לנו תשובות" intro="הנה מה ששותפים פוטנציאליים שואלים אותנו לפני שמצטרפים." />
        <div className="mt-6 space-y-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-xl border border-gray-100 bg-white p-4 shadow-card">
              <summary className="cursor-pointer list-none font-semibold text-gray-900">{q}</summary>
              <p className="mt-2 text-gray-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-page mt-16">
        <div className="rounded-3xl bg-gray-950 p-8 text-center text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">בדקו אם הקטגוריה שלכם פנויה</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-300">
            השאירו פרטים או שלחו הודעה - הצוות שלנו יבדוק זמינות ויחזור עם תוכנית שותפות מותאמת לעסק שלכם בהקדם.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white hover:brightness-95">
              שלחו הודעה ב-WhatsApp
            </a>
            <a href="#partner-form" className="rounded-xl border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">
              בדיקת התאמה ללא עלות
            </a>
          </div>
          <p className="mt-6 text-gray-300">
            מעדיפים לדבר? חייגו:{' '}
            <a href={telHref(SITE_CONTACT.mobilePhone)} dir="ltr" className="font-bold text-white underline">
              054-430-0202
            </a>{' '}
            <span className="text-green-400">· זמינים עכשיו</span>
          </p>
        </div>
      </section>
    </div>
  );
}
