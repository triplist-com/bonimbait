'use client';

/**
 * The "שאלו את בונים בית" question box: hero, header and the mobile ask sheet.
 * A real GET form to AI_ENTRY.href (works without JavaScript); with JS it
 * routes client-side. Example questions rotate in a decorative overlay while
 * the field is empty (paused for reduced motion).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AI_ENTRY, aiHref } from '@/lib/nav';
import { EXAMPLE_QUESTIONS, nextIndex } from '@/lib/home/questions';

export interface AskFormProps {
  size?: 'md' | 'lg' | 'xl';
  /** Rotate example questions as the placeholder. */
  rotate?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Visible label above the field (otherwise screen-reader only). */
  label?: string;
  className?: string;
  /** Called after navigation starts (e.g. to close a sheet). */
  onSubmitted?: () => void;
  /** Dark surround (header on ink). */
  tone?: 'light' | 'dark';
}

const SIZES = {
  md: { field: 'h-11 text-[0.9375rem] ps-10 pe-12', icon: 'start-3.5 size-4', button: 'size-8 justify-center', end: 'end-1.5' },
  lg: { field: 'h-14 text-body ps-12 pe-28', icon: 'start-4 size-5', button: 'h-10 px-4 text-[0.9375rem]', end: 'end-2' },
  xl: { field: 'h-16 sm:h-[4.5rem] text-body-lg ps-12 sm:ps-14 pe-32 sm:pe-36', icon: 'start-4 sm:start-5 size-5 sm:size-6', button: 'h-12 sm:h-14 px-5 sm:px-6 text-base', end: 'end-2' },
} as const;

export default function AskForm({
  size = 'lg',
  rotate = false,
  placeholder = 'שאלו כל שאלה על בניית הבית',
  autoFocus,
  label = 'השאלה שלכם',
  className,
  onSubmitted,
  tone = 'light',
}: AskFormProps) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const s = SIZES[size];

  useEffect(() => {
    if (!rotate) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex((i) => nextIndex(i, EXAMPLE_QUESTIONS.length)), 3600);
    return () => clearInterval(timer);
  }, [rotate]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    const q = value.trim();
    e.preventDefault();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    router.push(aiHref(q));
    onSubmitted?.();
  };

  const showOverlay = rotate && !value && !focused;
  const example = EXAMPLE_QUESTIONS[index]?.text;

  return (
    <form action={AI_ENTRY.href} method="get" role="search" onSubmit={submit} className={cn('relative w-full', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Sparkles
          aria-hidden="true"
          className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-primary-600', s.icon)}
        />
        <input
          ref={inputRef}
          id={id}
          name={AI_ENTRY.queryParam}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={rotate ? (focused ? placeholder : '') : placeholder}
          className={cn(
            'w-full rounded-2xl border bg-white text-ink-900 outline-none transition-[border-color,box-shadow] duration-200',
            'placeholder:text-ink-400 [&::-webkit-search-cancel-button]:hidden',
            tone === 'light'
              ? 'border-ink-200 shadow-search hover:border-ink-300 focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15'
              : 'border-white/15 focus:border-white focus:ring-4 focus:ring-white/20',
            s.field,
          )}
        />
        {showOverlay && example && (
          <span
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-y-0 flex items-center overflow-hidden text-ink-400', s.field.match(/ps-\S+/g)?.join(' '))}
            style={{ insetInlineStart: 0, insetInlineEnd: size === 'md' ? '3rem' : '8rem' }}
          >
            <span key={index} className="truncate motion-safe:animate-question-in">
              למשל: {example}
            </span>
          </span>
        )}
        <button
          type="submit"
          className={cn(
            'absolute top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-xl bg-primary-600 font-semibold text-white transition-colors hover:bg-primary-700',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
            s.button,
            s.end,
          )}
          aria-label={size === 'md' ? 'שאלו' : undefined}
        >
          {size !== 'md' && 'שאלו'}
          <ArrowLeft aria-hidden="true" className="size-4 ltr:rotate-180" />
        </button>
      </div>
    </form>
  );
}
