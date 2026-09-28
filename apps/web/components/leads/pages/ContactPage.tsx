import LeadForm from '@/components/leads/LeadForm';
import { CONTACT_FIELDS } from '@/lib/leads/fields';
import { SITE_CONTACT, telHref } from '@/lib/leads/constants';
import { CONTACT_EMAIL, SITE_HOST } from '@/lib/site';

/** /צור-קשר/ — live template "templates/contacts.php" + CF7 #795. */
export default function ContactPage() {
  const supportEmail = `support@${SITE_HOST}`;
  const cards = [
    {
      title: 'טלפון',
      body: (
        <>
          <p>
            משרד{' '}
            <a href={telHref(SITE_CONTACT.officePhone)} dir="ltr" className="font-semibold text-primary hover:text-primary-700">
              {SITE_CONTACT.officePhone}
            </a>
          </p>
          <p>
            או בנייד{' '}
            <a href={telHref(SITE_CONTACT.mobilePhone)} dir="ltr" className="font-semibold text-primary hover:text-primary-700">
              {SITE_CONTACT.mobilePhone}
            </a>
          </p>
          <p className="text-sm text-gray-500">{SITE_CONTACT.hours}</p>
        </>
      ),
    },
    {
      title: 'מייל',
      body: (
        <>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className="font-semibold text-primary hover:text-primary-700">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            <a href={`mailto:${supportEmail}`} dir="ltr" className="font-semibold text-primary hover:text-primary-700">
              {supportEmail}
            </a>
          </p>
        </>
      ),
    },
    { title: 'כתובת', body: <p>{SITE_CONTACT.address}</p> },
  ];

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">צור קשר</h1>
        <p className="mt-4 text-lg leading-relaxed text-gray-600">
          אנו בבונים בית עושים הכל על מנת להעניק לכם <strong>שירות יוצא דופן</strong> שהיינו רוצים לקבל בעצמנו זמינים
          עבורכם תמיד עם יחס אישי, אנושי ומועדף לכל בונה ומשפץ
        </p>
      </header>

      <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          {cards.map((c) => (
            <section key={c.title} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
              <h2 className="mb-2 text-lg font-bold text-gray-900">{c.title}</h2>
              <div className="space-y-1 text-gray-700">{c.body}</div>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8 lg:col-span-3">
          <h2 className="text-xl font-bold text-gray-900">השאירו פרטים ונחזור אליכם בהקדם</h2>
          <p className="mt-1 font-medium text-primary">בבונים בית אתה תמיד מדבר עם בן אדם!</p>
          <p className="mt-2 text-sm text-gray-600">
            אם יש לך שאלות או זקוק לעזרה, מלא את הטופס. אנו נעשה כמיטב יכולתנו להשיב תוך יום עסקים אחד.
          </p>
          <LeadForm
            className="mt-6"
            type="contact"
            fields={CONTACT_FIELDS}
            submitLabel="שלח"
            successRedirect="/thank-you/"
            idPrefix="contact"
          />
        </section>
      </div>
    </div>
  );
}
