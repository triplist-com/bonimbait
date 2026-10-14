import Image from 'next/image';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import ConsultationCTA, { WhatsAppChatButton } from '@/components/leads/ConsultationCTA';
import { AI_ENTRY, aiHref } from '@/lib/nav';
import { TEAM, teamPhotoUrl } from '@/lib/commerce/membership-content';

/** Closing band: talk to a person (consultation, WhatsApp) or ask. */
export default function FinalCTA() {
  const faces = TEAM.slice(0, 5);
  return (
    <section aria-labelledby="final-title" className="pt-14 sm:pt-20">
      <div className="container-page">
        <div
          data-floating-cta="hide"
          className="relative isolate overflow-hidden rounded-[2rem] bg-primary-600 px-6 py-12 text-center text-white sm:px-12 sm:py-16"
        >
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_85%_0%,rgb(254_51_102/0.9),transparent_60%),radial-gradient(60%_80%_at_0%_100%,rgb(125_12_61/0.85),transparent_65%)]" />
          <span aria-hidden="true" className="bg-blueprint-dark absolute inset-0 -z-10 opacity-60" />
          <div className="mx-auto max-w-2xl">
            <ul className="mb-6 flex justify-center -space-x-3 rtl:space-x-reverse" aria-label="צוות בונים בית">
              {faces.map((m) => (
                <li key={m.name}>
                  <Image
                    src={teamPhotoUrl(m.photo)}
                    alt={m.name}
                    width={96}
                    height={96}
                    sizes="48px"
                    className="size-12 rounded-full bg-white object-cover object-top ring-4 ring-primary-600"
                  />
                </li>
              ))}
            </ul>
            <h2 id="final-title" className="text-headline text-white">
              מתחילים לבנות? בואו נדבר.
            </h2>
            <p className="mt-4 text-body-lg text-white/85">
              פגישת ייעוץ תקציב ראשונה, ללא עלות וללא התחייבות. נבין יחד איפה אתם עומדים ומה הצעד הבא.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ConsultationCTA source="home-final" label="קביעת פגישת ייעוץ" buttonVariant="inverse" size="xl" />
              <WhatsAppChatButton className="h-14 rounded-2xl px-6" />
            </div>
            <p className="mt-6 text-sm text-white/80">
              או{' '}
              <Link href={aiHref()} className="inline-flex items-center gap-1 font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                <Sparkles aria-hidden="true" className="size-4" />
                {AI_ENTRY.label}
              </Link>{' '}
              ותקבלו תשובה מהשטח עכשיו.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
