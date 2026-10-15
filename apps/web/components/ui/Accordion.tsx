import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Accordion on native <details>/<summary>: keyboard and screen-reader support
 * for free, works without JavaScript, and renders in Server Components.
 *
 *   <Accordion items={[{ id: 'vat', title: 'המחירים כוללים מע״מ?', content: '…' }]} />
 *
 * `name` makes the items exclusive (one open at a time) in browsers that
 * support <details name>; others simply allow several open.
 */
export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  defaultOpen?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Group name for exclusive behaviour. */
  name?: string;
  variant?: 'cards' | 'divided';
  className?: string;
}

export function Accordion({ items, name, variant = 'divided', className }: AccordionProps) {
  return (
    <div className={cn(variant === 'divided' ? 'divide-y divide-ink-200 border-y border-ink-200' : 'space-y-3', className)}>
      {items.map((item) => (
        <details
          key={item.id}
          name={name}
          open={item.defaultOpen}
          className={cn('group', variant === 'cards' && 'rounded-2xl border border-ink-100 bg-white shadow-card open:shadow-card-hover')}
        >
          <summary
            className={cn(
              'flex cursor-pointer list-none items-center justify-between gap-4 text-start [&::-webkit-details-marker]:hidden',
              'rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
              variant === 'cards' ? 'px-5 py-4' : 'py-5',
            )}
          >
            {/* A span, not a heading: <summary> is a button, which flattens heading semantics. */}
            <span className="text-title-sm text-ink-900 sm:text-title">{item.title}</span>
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700 transition-transform duration-300 group-open:rotate-180 group-open:bg-primary-50 group-open:text-primary-700"
            >
              <ChevronDown className="size-4" />
            </span>
          </summary>
          <div className={cn('text-body text-ink-700', variant === 'cards' ? 'px-5 pb-5' : 'pb-5 pe-12')}>{item.content}</div>
        </details>
      ))}
    </div>
  );
}
