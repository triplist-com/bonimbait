import WhatsappJoinForm from '@/components/leads/WhatsappJoinForm';
import { getWhatsappGroups } from '@/lib/leads/groups';

const REASONS = [
  { title: 'להבין טוב יותר את התהליך', text: 'שלבי הבנייה, מסמכים, הרשאות, מי עושה מה ומתי, בלי הפתעות.' },
  { title: 'לשאול, להתייעץ ולקבל תשובות', text: 'קבלו תשובה מהירה בקבוצה האזורית שלכם, ממי שכבר היה שם.' },
  { title: 'המלצות אמיתיות על בעלי מקצוע', text: 'על קבלנים, ספקים, אדריכלים ובעלי מקצוע. מהשטח, לא מהפרסומות.' },
];

const STATS = [
  { value: '+40K', label: 'משפחות בקהילה' },
  { value: '11', label: 'קבוצות אזוריות פעילות' },
  { value: 'מאות', label: 'שאלות ותשובות מדי שבוע' },
];

const FAQ = [
  { q: 'האם ההצטרפות כרוכה בתשלום?', a: 'לא. ההצטרפות לקהילה ולקבוצות היא ללא עלות.' },
  { q: 'אני רק בתחילת הדרך. זה מתאים גם לי?', a: 'בהחלט. הקהילה מתאימה לכל שלב, מחיפוש מגרש ועד גמר הבנייה ושיפוצים.' },
  {
    q: 'מה הכלל לגבי פרסום בקבוצות?',
    a: 'הקבוצות מיועדות לבונים ומשפצים פרטיים בלבד, לא לבעלי מקצוע. שיתוף ידע, התייעצויות ועזרה הדדית.',
  },
  {
    q: 'איך בוחרים את הקבוצה הנכונה?',
    a: 'בחרו את האזור הגיאוגרפי שבו אתם בונים או מתגוררים. כך תקבלו מענה רלוונטי לאזורכם.',
  },
  {
    q: 'האם אפשר להיות בכמה קבוצות?',
    a: 'כן, אם רלוונטי לכם. הצטרפו לאזור העיקרי תחילה, ואם תרצו הוסיפו עוד דרך אותו טופס.',
  },
];

/** /הצטרפו-לקבוצות-הווטסאפ/ — live Elementor page 72528. */
export default async function WhatsappJoinPage() {
  const groups = await getWhatsappGroups();
  return (
    <div className="pb-16">
      <section className="bg-gradient-to-b from-primary-50 to-background">
        <div className="container-page grid grid-cols-1 items-start gap-10 py-12 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="font-semibold text-primary">קהילת בונים בית</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
              הצטרפו לקהילה של עשרות אלפי משפחות בונות ומשפצות
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              קבוצות ווטסאפ אזוריות לליווי, ייעוץ והתייעצויות בזמן אמת. עם משפחות שכבר עברו את התהליך, ולא לבד.
            </p>
            <ul className="mt-6 flex flex-wrap gap-3 text-sm font-medium text-gray-700">
              {['הצטרפות חינם', 'בלי פרסומות ובלי ספאם', '11 קבוצות בכל הארץ'].map((t) => (
                <li key={t} className="rounded-full bg-white px-4 py-1.5 shadow-card">
                  {t}
                </li>
              ))}
            </ul>

            <h2 className="mt-10 text-lg font-bold text-gray-900">הקבוצות האזוריות</h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="קבוצות WhatsApp אזוריות">
              {groups.map((g) => (
                <li
                  key={g.slug}
                  className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-gray-800"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#25D366]" aria-hidden="true" />
                  {g.name}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-gray-500">קישור ההצטרפות לקבוצה יוצג מיד לאחר מילוי הטופס.</p>
          </div>

          <WhatsappJoinForm
            heading="הצטרפו בחינם לקבוצת WhatsApp באזור שלכם"
            intro="שאלות, המלצות וניסיון אמיתי מהשטח."
            idPrefix="wa-page"
          />
        </div>
      </section>

      <section className="container-page mt-14">
        <p className="text-center font-semibold text-primary">למה להצטרף</p>
        <h2 className="mt-1 text-center text-2xl font-bold text-gray-900">שלוש סיבות שמשפחות מצטרפות לקהילה</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
          כשמשפחות שכבר בנו ושיפצו חולקות את מה שלמדו, אפשר לחסוך טעויות, זמן וכסף בכל שלב בדרך.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
              <h3 className="text-lg font-bold text-gray-900">{r.title}</h3>
              <p className="mt-2 text-gray-600">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page mt-14">
        <p className="text-center font-semibold text-primary">הקהילה</p>
        <h2 className="mt-1 text-center text-2xl font-bold text-gray-900">הקהילה במספרים</h2>
        <dl className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white p-6 text-center shadow-card">
              <dt className="text-sm text-gray-600">{s.label}</dt>
              <dd className="order-first text-4xl font-black text-primary" dir="ltr">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="container-page mt-14 max-w-3xl">
        <p className="text-center font-semibold text-primary">שאלות נפוצות</p>
        <h2 className="mt-1 text-center text-2xl font-bold text-gray-900">כל מה שרצית לדעת לפני שמצטרפים</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-gray-100 bg-white p-4 shadow-card">
              <summary className="cursor-pointer list-none font-semibold text-gray-900">{f.q}</summary>
              <p className="mt-2 text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container-page mt-14 text-center">
        <h2 className="text-2xl font-bold text-gray-900">תהיו חלק מהקהילה</h2>
        <p className="mt-2 text-gray-600">
          מלאו פרטים בטופס למעלה ותועברו ישר לקבוצה האזורית שלכם, בלי המתנה ובלי בירוקרטיה.
        </p>
        <a
          href="#join-form"
          className="mt-5 inline-block rounded-xl bg-[#25D366] px-8 py-3 font-semibold text-white shadow-md hover:brightness-95"
        >
          להצטרפות לקבוצה
        </a>
      </section>
    </div>
  );
}
