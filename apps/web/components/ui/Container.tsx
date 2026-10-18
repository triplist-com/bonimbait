import type { ElementType, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ContainerSize = 'narrow' | 'prose' | 'default' | 'wide';

const SIZES: Record<ContainerSize, string> = {
  narrow: 'max-w-3xl',
  prose: 'max-w-prose',
  default: 'max-w-7xl',
  wide: 'max-w-[90rem]',
};

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  size?: ContainerSize;
  as?: ElementType;
}

/** Centred column with responsive gutters (16px on phones, 32px on desktop). */
export function Container({ size = 'default', as: Tag = 'div', className, ...rest }: ContainerProps) {
  return <Tag className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZES[size], className)} {...rest} />;
}
