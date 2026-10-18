import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Container, type ContainerSize } from './Container';

export type SectionTone = 'paper' | 'white' | 'sand' | 'ink' | 'brand';
export type SectionSpacing = 'sm' | 'md' | 'lg';

const TONES: Record<SectionTone, string> = {
  paper: 'bg-paper text-ink-900',
  white: 'bg-white text-ink-900',
  sand: 'bg-sand-50 text-ink-900',
  ink: 'bg-ink-950 text-white',
  brand: 'bg-primary-600 text-white',
};

const SPACING: Record<SectionSpacing, string> = {
  sm: 'py-10 sm:py-12',
  md: 'py-14 sm:py-20',
  lg: 'py-16 sm:py-24',
};

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  tone?: SectionTone;
  spacing?: SectionSpacing;
  /** Inner container width, or false for full-bleed content. */
  container?: ContainerSize | false;
  /** id of the section's heading, for an accessible region name. */
  labelledBy?: string;
}

/** Full-bleed page band with the system's vertical rhythm. */
export function Section({
  tone = 'paper',
  spacing = 'md',
  container = 'default',
  labelledBy,
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section aria-labelledby={labelledBy} className={cn('relative', TONES[tone], SPACING[spacing], className)} {...rest}>
      {container ? <Container size={container}>{children}</Container> : children}
    </section>
  );
}
