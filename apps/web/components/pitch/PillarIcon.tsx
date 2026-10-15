import {
  Calculator,
  Clapperboard,
  FolderOpen,
  Gauge,
  HardHat,
  Handshake,
  MessagesSquare,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { PillarIcon as PillarIconName } from '@/lib/pitch/pillars';

const ICONS: Record<PillarIconName, LucideIcon> = {
  advisor: MessagesSquare,
  planner: Calculator,
  hub: FolderOpen,
  command: Gauge,
  revenue: Handshake,
  bonimos: HardHat,
  autopilot: Clapperboard,
  switch: ShieldCheck,
};

/** The icon of a pillar (decorative: the pillar name is always next to it). */
export default function PillarIcon({ name, className }: { name: PillarIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
