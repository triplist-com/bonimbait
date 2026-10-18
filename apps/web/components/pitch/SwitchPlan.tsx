import { ArrowLeft, Mail } from 'lucide-react';
import { Accordion } from '@/components/ui/Accordion';
import { ButtonLink } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SocialIcon } from '@/components/ui/SocialIcon';
import { hasContact, type PitchContact } from '@/lib/pitch/contact';
import { SWITCH_TIMELINE, type FaqEntry } from '@/lib/pitch/plan';

function Timeline() {
  return (
    <ol className="relative grid gap-4 md:grid-cols-4 md:gap-5">
      {/* the rail behind the dots (logical, so it runs right to left) */}
      <div aria-hidden="true" className="absolute inset-x-6 top-5 hidden h-px bg-ink-200 md:block" />
      {SWITCH_TIMELINE.map((step, i) => (
        <li key={step.id} className="relative flex gap-4 md:flex-col md:gap-3">
          <span
            aria-hidden="true"
            className="relative z-10 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-extrabold text-white ring-4 ring-white"
          >
            <span className="num">{i + 1}</span>
          </span>
          <div className="pb-2">
            <p className="text-sm font-bold text-primary-700">{step.when}</p>
            <h3 className="text-title text-ink-900">{step.title}</h3>
            <p className="mt-1 text-body-sm text-ink-600">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Contact({ contact }: { contact: PitchContact }) {
  const talk = contact.name ? `דברו עם ${contact.name}` : 'בואו נדבר';
  return (
    <div className="relative isolate overflow-hidden rounded-[2rem] bg-primary-600 px-6 py-10 text-white sm:px-10 sm:py-12">
      <div aria-hidden="true" className="absolute -top-24 end-[-6rem] -z-10 size-72 rounded-full bg-white/10 blur-2xl" />
      <div className="grid items-center gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-headline-sm text-white">
            {hasContact(contact) ? talk : 'רוצים לראות את זה רץ מקרוב?'}
          </h3>
          <p className="mt-2 max-w-lg text-body text-white/85">
            הצעד הבא: גישת צפייה ל-GA4 כדי להחליף הנחות במספרים שלכם, ושבועיים של הרצה מקבילה עם הצוות.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          {contact.whatsapp && (
            <ButtonLink
              href={contact.whatsapp.href}
              external
              size="lg"
              variant="inverse"
              iconStart={<SocialIcon id="whatsapp" className="size-5" />}
            >
              וואטסאפ
            </ButtonLink>
          )}
          {contact.email && (
            <ButtonLink href={contact.email.href} size="lg" variant="inverse" iconStart={<Mail aria-hidden="true" />}>
              מייל
            </ButtonLink>
          )}
          {!hasContact(contact) && (
            <ButtonLink href="/platform/tour/" size="lg" variant="inverse" iconEnd={<ArrowLeft aria-hidden="true" className="ltr:rotate-180" />}>
              לסיור של 15 דקות
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

/** Section 6: how the switch happens, the objections answered, and who to call. */
export default function SwitchPlan({ faq, contact }: { faq: FaqEntry[]; contact: PitchContact }) {
  return (
    <Section tone="white" id="plan" labelledBy="plan-title" className="scroll-mt-8 md:scroll-mt-0">
      <SectionHeader
        id="plan-title"
        eyebrow="תוכנית המעבר"
        title="שבועיים במקביל, ערב אחד של מעבר"
        highlight="ערב אחד"
        description="בלי השבתה ובלי ״נראה מה יקרה״. כל שלב הפיך, וכל שלב נבדק."
      />
      <Timeline />

      <div className="mt-14 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h3 id="faq-title" className="text-headline-sm text-ink-900">
            שאלות שכדאי לשאול
          </h3>
          <p className="mt-2 text-body text-ink-600">והתשובות, בלי אותיות קטנות.</p>
        </div>
        <div className="lg:col-span-8" aria-labelledby="faq-title" role="region">
          <Accordion name="pitch-faq" items={faq.map((f) => ({ id: f.id, title: f.q, content: <p>{f.a}</p> }))} />
        </div>
      </div>

      <div className="mt-14" data-floating-cta="hide">
        <Contact contact={contact} />
      </div>
    </Section>
  );
}
