import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ViewableImpression from '@/components/analytics/ViewableImpression';
import { Avatar } from '@/components/ui/Avatar';
import { buttonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { OfferPlacement, PartnerOffer } from '@/lib/revenue/types';
import PartnerTierBadge from './PartnerTierBadge';

/**
 * One sponsored partner offer, measured: <ViewableImpression> records
 * partner_impression (>=50% visible for >=1s while the visitor is active,
 * deduped 30 min) and partner_click on the CTA, with the partner's business id
 * as partner_id and the campaign as offer_id. Clearly marked as sponsored.
 * Server-safe; the measuring wrapper is the only client part.
 */
export default function PartnerOfferCard({
  offer,
  slot,
  placement,
  className,
}: {
  offer: PartnerOffer;
  /** Slot id; the partner is appended so a rotating slot dedupes per partner. */
  slot: string;
  placement?: OfferPlacement;
  className?: string;
}) {
  return (
    <ViewableImpression slot={`${slot}:${offer.businessId}`} partnerId={offer.businessId} offerId={offer.campaignId} placement={placement} className={className}>
      <aside aria-label={`הצעה מ${offer.businessName}`} data-floating-cta="hide" className="rounded-3xl border border-sand-200 bg-sand-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption font-semibold text-ink-500">תוכן ממומן · שותפי בונים בית</p>
          <PartnerTierBadge badge={offer.tier ? { tierSlug: offer.tier.slug, tierName: offer.tier.name, badgeLabel: offer.tier.badgeLabel, rank: offer.tier.rank } : null} />
        </div>
        <div className="mt-3 flex items-start gap-3.5">
          <Avatar name={offer.businessName} src={offer.logoUrl} size="lg" shape="rounded" fit="contain" className="bg-white ring-1 ring-sand-200" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-700">{offer.businessName}</p>
            <h3 className="mt-0.5 text-title text-ink-900">{offer.headline}</h3>
            {offer.body && <p className="mt-1.5 text-body-sm text-ink-600">{offer.body}</p>}
          </div>
        </div>
        <Link href={offer.href} className={cn(buttonClasses({ variant: 'outline', size: 'md', className: 'mt-4' }), 'bg-white')}>
          {offer.ctaLabel}
          <ArrowLeft aria-hidden="true" className="ltr:rotate-180" />
        </Link>
      </aside>
    </ViewableImpression>
  );
}
