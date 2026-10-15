import { BadgeCheck } from 'lucide-react';
import { Badge, type BadgeSize } from '@/components/ui/Badge';
import type { PartnerBadge } from '@/lib/revenue/tiers';

/**
 * "שותף בונים בית": a business on a partner tier (חברים / שותפים / שגרירים).
 * Higher tiers wear the brand tone; the label always says it in words.
 */
export default function PartnerTierBadge({ badge, size = 'sm', className }: { badge: PartnerBadge | null | undefined; size?: BadgeSize; className?: string }) {
  if (!badge) return null;
  return (
    <Badge tone={badge.rank >= 2 ? 'brand' : 'sand'} size={size} icon={<BadgeCheck />} className={className} title={`מסלול ${badge.tierName}`}>
      {badge.badgeLabel}
    </Badge>
  );
}
