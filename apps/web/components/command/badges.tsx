import { CircleCheck, CircleDashed, CircleAlert, Clapperboard, OctagonAlert, Power, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PARTNER_STATUS_LABELS } from '@/lib/command/partners';
import type { CommandCenterData, CoverageLevel, PartnerHealthStatus } from '@/lib/command/types';

/** Status badges: reserved status tones, always an icon and words. */

export const COVERAGE_LABELS: Record<CoverageLevel, string> = {
  gap: 'אין עליו סרטון',
  partial: 'כיסוי חלקי',
  covered: 'יש תשובה',
};

export function CoverageBadge({ level, size = 'md' }: { level: CoverageLevel | null; size?: 'sm' | 'md' }) {
  if (!level) {
    return (
      <Badge tone="neutral" size={size} icon={<CircleDashed />}>
        עוד לא נבדק
      </Badge>
    );
  }
  if (level === 'gap') {
    return (
      <Badge tone="brand" size={size} icon={<Clapperboard />}>
        {COVERAGE_LABELS.gap}
      </Badge>
    );
  }
  if (level === 'partial') {
    return (
      <Badge tone="warning" size={size} icon={<TriangleAlert />}>
        {COVERAGE_LABELS.partial}
      </Badge>
    );
  }
  return (
    <Badge tone="success" size={size} icon={<CircleCheck />}>
      {COVERAGE_LABELS.covered}
    </Badge>
  );
}

export function PartnerStatusBadge({ status }: { status: PartnerHealthStatus }) {
  const label = PARTNER_STATUS_LABELS[status];
  if (status === 'on_track') return <Badge tone="success" size="sm" icon={<CircleCheck />}>{label}</Badge>;
  if (status === 'behind') return <Badge tone="warning" size="sm" icon={<TriangleAlert />}>{label}</Badge>;
  if (status === 'at_risk') return <Badge tone="danger" size="sm" icon={<OctagonAlert />}>{label}</Badge>;
  return <Badge tone="neutral" size="sm" icon={<CircleDashed />}>{label}</Badge>;
}

export const CAP_LABELS: Record<CommandCenterData['ai']['capStatus'], string> = {
  ok: 'בטווח התקרה',
  near: 'קרוב לתקרה',
  reached: 'הגיע לתקרה',
  off: 'כבוי',
};

export function CapBadge({ status }: { status: CommandCenterData['ai']['capStatus'] }) {
  const label = CAP_LABELS[status];
  if (status === 'ok') return <Badge tone="success" size="sm" icon={<CircleCheck />}>{label}</Badge>;
  if (status === 'near') return <Badge tone="warning" size="sm" icon={<TriangleAlert />}>{label}</Badge>;
  if (status === 'reached') return <Badge tone="danger" size="sm" icon={<CircleAlert />}>{label}</Badge>;
  return <Badge tone="neutral" size="sm" icon={<Power />}>{label}</Badge>;
}
