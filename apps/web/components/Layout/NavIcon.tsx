import {
  BookOpen,
  Calculator,
  ClipboardCheck,
  Gift,
  Handshake,
  Info,
  Megaphone,
  MessageCircle,
  Phone,
  PlayCircle,
  Tv,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { NavIconName } from '@/lib/nav';

const ICONS: Record<NavIconName, LucideIcon> = {
  guide: BookOpen,
  media: PlayCircle,
  pros: UsersRound,
  calculator: Calculator,
  management: ClipboardCheck,
  benefits: Gift,
  community: MessageCircle,
  tv: Tv,
  about: Info,
  contact: Phone,
  advertise: Megaphone,
  partners: Handshake,
};

/** Renders a nav config icon key (lib/nav.ts) as a lucide icon. */
export function NavIcon({ name, className }: { name?: NavIconName; className?: string }) {
  if (!name) return null;
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
