'use client';

/**
 * The ₪500 plan-budget offer's call to action: opens a short request form
 * (name and phone) in a dialog. The lead goes through the regular pipeline
 * as a `budget_report` with `offer=plan_budget`, so the team calls back
 * until uploading and paying online exist.
 */
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import LeadForm from '@/components/leads/LeadForm';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PLAN_BUDGET_OFFER } from '@/lib/home/content';
import type { LeadField } from '@/lib/leads/types';

const FIELDS: readonly LeadField[] = [
  { name: 'full_name', label: 'שם מלא', type: 'text', required: true, width: 'half', autoComplete: 'name' },
  { name: 'phone', label: 'טלפון', type: 'tel', required: true, width: 'half', autoComplete: 'tel' },
];

export default function PlanBudgetRequest() {
  const [open, setOpen] = useState(false);
  const { form } = PLAN_BUDGET_OFFER;

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
        {PLAN_BUDGET_OFFER.cta}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={form.title} description={form.description}>
        <LeadForm
          type="budget_report"
          fields={FIELDS}
          submitLabel={form.submit}
          successTitle={form.successTitle}
          successMessage={form.successMessage}
          context={{ offer: 'plan_budget', offer_price: '500', cta_source: 'home-plan-budget' }}
          idPrefix="plan-budget"
        />
      </Dialog>
    </>
  );
}
