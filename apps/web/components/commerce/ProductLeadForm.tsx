import LeadForm from '@/components/leads/LeadForm';
import { BENEFIT_FIELDS } from '@/lib/leads/fields';
import type { LeadField } from '@/lib/leads/types';
import { productLeadAction } from '@/lib/commerce/actions';
import { LEAD_STAGES } from '@/lib/commerce/forms';

/** Where the live site sends product leads (page owned by the Leads workstream). */
const PRODUCT_LEAD_THANK_YOU = encodeURI('/תודה-על-השארת-פרטים-מוצר/');

/**
 * The live product form: BENEFIT_FIELDS, but region and stage are required
 * (as on live), the stage list is the live 7-option list, and the RINNAI
 * product adds an optional "urgent" checkbox.
 */
function productFields(urgentOption: boolean): LeadField[] {
  const fields: LeadField[] = BENEFIT_FIELDS.map((f) => {
    if (f.name === 'region') return { ...f, required: true, requiredMessage: 'נא לבחור מיקום פרויקט' };
    if (f.name === 'construction_stage')
      return { ...f, required: true, width: 'half', options: LEAD_STAGES, requiredMessage: 'נא לבחור שלב בניה' };
    return f;
  });
  if (urgentOption) {
    const consentAt = fields.findIndex((f) => f.type === 'checkbox');
    fields.splice(consentAt < 0 ? fields.length : consentAt, 0, {
      name: 'urgent',
      label: 'אופציונלי: יש לי צורך מיידי במחמם ואשמח לפנייה מוקדמת',
      type: 'checkbox',
    });
  }
  return fields;
}

/**
 * "מעוניינים במוצר? השאירו פרטים ונחזור אליכם" → `benefit` lead (shared Leads
 * pipeline) → /תודה-על-השארת-פרטים-מוצר/.
 */
export default function ProductLeadForm({
  productId,
  productName,
  heading,
  urgentOption,
}: {
  productId: string;
  productName: string;
  heading: string;
  urgentOption: boolean;
}) {
  const [lead, ...rest] = heading.split('?');
  return (
    <section aria-labelledby="product-lead-heading" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <h2 id="product-lead-heading" className="mb-4 text-lg text-gray-900">
        {rest.length ? (
          <>
            <strong>{lead}?</strong> {rest.join('?').trim()}
          </>
        ) : (
          <strong>{heading}</strong>
        )}
      </h2>
      <LeadForm
        type="benefit"
        fields={productFields(urgentOption)}
        submitLabel="חזרו אליי"
        successRedirect={PRODUCT_LEAD_THANK_YOU}
        productId={productId}
        context={{ product_name: productName }}
        action={productLeadAction}
        footnote="* יצירת הקשר תתבצע במהלך 60 הימים הקרובים"
        idPrefix="product-lead"
      />
    </section>
  );
}
