'use client';

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation).
 *
 *   <Tabs
 *     label="סוג תוכן"
 *     tabs={[
 *       { id: 'videos', label: 'סרטונים', content: <VideoGrid /> },
 *       { id: 'podcast', label: 'פודקאסט', content: <PodcastList />, count: 112 },
 *     ]}
 *   />
 *
 * Arrow keys follow reading direction (ArrowLeft = next in RTL), Home/End jump.
 */
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { rovingIndex } from '@/lib/a11y/focus';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Accessible name of the tab list. */
  label: string;
  defaultTab?: string;
  /** Controlled mode. */
  value?: string;
  onChange?: (id: string) => void;
  variant?: 'pill' | 'underline';
  className?: string;
  panelClassName?: string;
}

export function Tabs({ tabs, label, defaultTab, value, onChange, variant = 'pill', className, panelClassName }: TabsProps) {
  const base = useId();
  const [internal, setInternal] = useState(defaultTab ?? tabs[0]?.id);
  const active = value ?? internal;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const enabled = tabs.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled);

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className={cn(
          'flex max-w-full gap-1 overflow-x-auto scrollbar-none',
          variant === 'pill' ? 'w-fit rounded-2xl bg-ink-100 p-1' : 'border-b border-ink-200',
        )}
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => {
                const pos = enabled.findIndex((x) => x.i === i);
                const dir = (getComputedStyle(e.currentTarget).direction as 'rtl' | 'ltr') || 'rtl';
                const next = rovingIndex(e.key, pos, enabled.length, dir);
                if (next === null) return;
                e.preventDefault();
                const target = enabled[next];
                refs.current[target.i]?.focus();
                select(target.t.id);
              }}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors duration-200',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-40',
                '[&_svg]:size-4',
                variant === 'pill'
                  ? cn('h-10 rounded-xl px-4', selected ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900')
                  : cn(
                      '-mb-px h-11 border-b-2 px-3',
                      selected ? 'border-primary-600 text-ink-900' : 'border-transparent text-ink-600 hover:text-ink-900',
                    ),
              )}
            >
              {tab.icon && <span aria-hidden="true" className="contents">{tab.icon}</span>}
              {tab.label}
              {typeof tab.count === 'number' && (
                <span className={cn('num rounded-full px-1.5 text-xs', selected ? 'bg-primary-50 text-primary-700' : 'bg-ink-200/60 text-ink-600')}>
                  {tab.count.toLocaleString('he-IL')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className={cn('mt-6 focus-visible:outline-none', panelClassName)}
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  );
}
