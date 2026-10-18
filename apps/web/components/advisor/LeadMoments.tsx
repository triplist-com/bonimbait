'use client';

/**
 * Lead moments under an answer, mapped to the owner's products:
 *   - the free consultation (the existing ConsultationCTA, never forked: the
 *     revenue squad turns it into a booking that carries the project file);
 *   - "תקציב ראשוני ב-3 דקות" (the budget planner) for cost questions;
 *   - matched pros, narrowed to the visitor's region when it's known and
 *     ordered by the revenue squad's rankPros() (a partner tier shows as a badge);
 *   - at most one sponsored partner offer that fits the topic, stage and
 *     region (AdvisorPartnerSlot: getContextualOffers on the server, measured by
 *     <ViewableImpression> inside PartnerOfferCard). It never replaces the pros.
 * Each card sends lead_cta_shown once when it's half visible and
 * lead_cta_clicked on a click inside it.
 */
import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Calculator, Users } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import BusinessLogo from '@/components/directory/BusinessLogo';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import PartnerOfferCard from '@/components/revenue/PartnerOfferCard';
import PartnerTierBadge from '@/components/revenue/PartnerTierBadge';
import { track } from '@/lib/analytics/track';
import { cn } from '@/lib/cn';
import { ANSWER_OFFER_SLOT } from '@/lib/advisor/offer';
import type { AdvisorIntent, AdvisorPros } from '@/lib/advisor/types';
import type { PartnerOffer } from '@/lib/revenue/types';

type LeadCta = 'consultation' | 'budget_plan' | 'pros';

function TrackedLead({ cta, specialty, children, className }: { cta: LeadCta; specialty?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track('lead_cta_shown', { cta, placement: 'answer', ...(specialty ? { specialty } : {}) });
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cta, specialty]);
  return (
    <div
      ref={ref}
      className={cn('h-full', className)}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) track('lead_cta_clicked', { cta, placement: 'answer', ...(specialty ? { specialty } : {}) });
      }}
    >
      {children}
    </div>
  );
}

/**
 * The sponsored partner offer under an answer (P3, revenue squad): the one
 * live campaign the server matched to the answer's topic and the builder's
 * stage and region (lib/advisor/pipeline.ts -> getContextualOffers). The card
 * is clearly marked as sponsored and measured: viewable impressions and clicks
 * go to the partner's report, and a lead within 4 hours is attributed to it.
 */
export function AdvisorPartnerSlot({ offer, className }: { offer?: PartnerOffer | null; className?: string }) {
  if (!offer) return null;
  return <PartnerOfferCard offer={offer} slot={ANSWER_OFFER_SLOT} placement="answer" className={className} />;
}

function PlannerCard() {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <p className="eyebrow">
        <Calculator aria-hidden="true" className="size-4" />
        מתכנן התקציב
      </p>
      <h3 className="mt-1 text-title-lg text-ink-900">תקציב ראשוני ב-3 דקות</h3>
      <p className="mt-1.5 text-body-sm text-ink-600">ענו על כמה שאלות על הבית שלכם, וקבלו הערכה ראשונית לפי שלבי הבנייה.</p>
      <ButtonLink href="/calculator/" variant="secondary" size="lg" fullWidth className="mt-auto" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
        לתקציב הראשוני
      </ButtonLink>
    </article>
  );
}

function ProsCard({ pros }: { pros: AdvisorPros }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <p className="eyebrow">
        <Users aria-hidden="true" className="size-4" />
        נבחרת המומלצים
      </p>
      <h3 className="mt-1 text-title-lg text-ink-900">{pros.specialty.name}</h3>
      {pros.region && <p className="text-body-sm text-ink-600">פעילים ב{pros.region.name}</p>}
      <ul className="mt-3 space-y-2">
        {pros.pros.map((p) => (
          <li key={p.slug}>
            <Link
              href={p.href}
              prefetch={false}
              className="flex items-center gap-3 rounded-2xl border border-ink-100 p-2.5 transition-colors hover:border-primary-300 hover:bg-primary-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              <BusinessLogo name={p.name} src={p.logo_url} className="size-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{p.name}</span>
                {(p.city || p.tagline) && <span className="block truncate text-caption text-ink-500">{p.city || p.tagline}</span>}
              </span>
              <PartnerTierBadge badge={p.badge} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      <Link href={pros.specialty.href} prefetch={false} className="link mt-3 inline-flex self-start text-sm">
        לכל {pros.specialty.name}
      </Link>
    </article>
  );
}

export interface LeadMomentsProps {
  intent: AdvisorIntent | null;
  pros: AdvisorPros | null;
  /** The answer's sponsored partner offer, when one fits. */
  offer?: PartnerOffer | null;
  /** No answer from the library: lead with the consultation. */
  unanswered?: boolean;
  className?: string;
}

export default function LeadMoments({ intent, pros, offer, unanswered, className }: LeadMomentsProps) {
  const cost = Boolean(intent?.cost);
  const consultTitle = unanswered ? 'נבדוק את זה יחד' : cost ? 'רוצים מספר מדויק לבית שלכם?' : 'רוצים לעבור על זה עם מומחה?';
  const consultText = unanswered
    ? 'בפגישת ייעוץ ללא עלות נענה על השאלה שלכם ונבין איפה אתם עומדים.'
    : cost
      ? 'בפגישת ייעוץ תקציב ללא עלות נעבור על התוכניות, השטח והתקציב שלכם.'
      : 'פגישת ייעוץ ללא עלות וללא התחייבות עם מומחה בונים בית.';
  return (
    <section aria-label="הצעד הבא" className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {cost && !unanswered && (
        <TrackedLead cta="budget_plan">
          <PlannerCard />
        </TrackedLead>
      )}
      <TrackedLead cta="consultation">
        <ConsultationCTA variant="card" source="advisor" title={consultTitle} description={consultText} className="h-full" />
      </TrackedLead>
      {pros && pros.pros.length > 0 && (
        <TrackedLead cta="pros" specialty={pros.specialty.name} className={cost ? 'sm:col-span-2' : undefined}>
          <ProsCard pros={pros} />
        </TrackedLead>
      )}
      {!unanswered && <AdvisorPartnerSlot offer={offer} className="sm:col-span-2" />}
    </section>
  );
}
