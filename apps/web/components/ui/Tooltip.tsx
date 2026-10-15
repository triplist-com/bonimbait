'use client';

import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: ReactNode;
  /** One focusable element (button, link). */
  children: ReactElement;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * Short supplementary label on hover and keyboard focus (WCAG 1.4.13: it can
 * be hovered, stays while needed and Escape dismisses it). Never put essential
 * information only in a tooltip; it is not reachable by touch.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': id })
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-ink-900 px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-white shadow-lift',
          'transition-[opacity,transform] duration-150',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'visible opacity-100' : 'invisible translate-y-0.5 opacity-0',
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
