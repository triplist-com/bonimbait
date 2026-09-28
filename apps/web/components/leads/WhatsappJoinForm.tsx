import LeadForm from './LeadForm';
import { whatsappJoinFields } from '@/lib/leads/fields';
import { getWhatsappGroups } from '@/lib/leads/groups';

/**
 * The live "bbwa-form" card: join the regional WhatsApp group. Submitting
 * records a `whatsapp_join` lead, then reveals that group's invite link
 * (read server-side; never present in the page before submission).
 * Server Component: loads the public group list.
 */
export default async function WhatsappJoinForm({
  heading = 'רוצים להמשיך לקבל ערך מהקהילה?',
  intro = 'הצטרפו בחינם לקבוצת WhatsApp באזור שלכם — שאלות, המלצות וניסיון אמיתי מהשטח.',
  idPrefix = 'wa-join',
  className = '',
}: {
  heading?: string;
  intro?: string;
  idPrefix?: string;
  className?: string;
}) {
  const groups = await getWhatsappGroups();
  return (
    <div id="join-form" className={`rounded-2xl border border-gray-100 bg-white p-6 shadow-card sm:p-8 ${className}`}>
      <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{heading}</h2>
      <p className="mt-2 text-gray-600">{intro}</p>
      <p className="mt-1 text-sm text-gray-500">הקבוצות מיועדות לבונים ומשפצים פרטיים בלבד</p>
      <LeadForm
        className="mt-5"
        type="whatsapp_join"
        fields={whatsappJoinFields(groups)}
        submitLabel="הצטרפו לקבוצת WhatsApp באזורכם"
        pendingLabel="רושמים אתכם..."
        footnote="המידע שלכם מאובטח ולא ישותף"
        idPrefix={idPrefix}
      />
    </div>
  );
}
