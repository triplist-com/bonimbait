import { getContextualOffers } from '@/lib/revenue/offers-server';
import type { OfferContext, OfferPlacement } from '@/lib/revenue/types';
import PartnerOfferCard from './PartnerOfferCard';

/**
 * A sponsored partner slot for a page: the best live campaign for the
 * context (topic, stage, region), or nothing. Server Component: it reads
 * public data only, so the pages around it stay static (ISR).
 *
 *   <PartnerOfferSlot slot="article" context={{ topic: post.title, stage: 'frame', placement: 'article' }} />
 */
export default async function PartnerOfferSlot({
  slot,
  context,
  className,
}: {
  slot: string;
  context: OfferContext & { placement: OfferPlacement };
  className?: string;
}) {
  const [offer] = await getContextualOffers(context, { limit: 1 });
  if (!offer) return null;
  return <PartnerOfferCard offer={offer} slot={slot} placement={context.placement} className={className} />;
}
