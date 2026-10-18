'use client';

/**
 * The advisor's question box. Grows with the text (up to 4 lines), Enter sends
 * (Shift+Enter for a new line, IME-safe), and while an answer streams the send
 * button becomes "stop". `hero` is the large first-screen box; `dock` sits at
 * the bottom of the conversation and carries data-floating-cta="hide" so the
 * site's floating action never covers it.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Square } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ComposerHandle {
  focus: () => void;
  setValue: (v: string) => void;
}

export interface ComposerProps {
  onSubmit: (question: string) => void;
  onStop?: () => void;
  busy?: boolean;
  placeholder?: string;
  variant?: 'hero' | 'dock';
  label?: string;
  autoFocus?: boolean;
  className?: string;
}

const MAX_CHARS = 300;

const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSubmit, onStop, busy, placeholder = 'שאלו כל שאלה על בניית הבית', variant = 'dock', label = 'השאלה שלכם', autoFocus, className },
  ref,
) {
  const [value, setValue] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus(), setValue }), []);

  // Grow with the content, up to ~4 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, variant === 'hero' ? 168 : 132)}px`;
  }, [value, variant]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = value.trim();
    if (!q) {
      area.current?.focus();
      return;
    }
    if (busy) return;
    onSubmit(q);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const hero = variant === 'hero';
  return (
    <form
      onSubmit={submit}
      role="search"
      data-floating-cta={hero ? undefined : 'hide'}
      className={cn(
        'relative flex items-end gap-2 rounded-[1.75rem] border bg-white transition-[border-color,box-shadow] duration-200',
        'border-ink-200 shadow-search focus-within:border-primary-600 focus-within:ring-4 focus-within:ring-primary-600/15',
        hero ? 'p-2.5 ps-5' : 'p-1.5 ps-4',
        className,
      )}
    >
      <label htmlFor={`composer-${variant}`} className="sr-only">
        {label}
      </label>
      <textarea
        ref={area}
        id={`composer-${variant}`}
        rows={1}
        value={value}
        maxLength={MAX_CHARS}
        autoFocus={autoFocus}
        enterKeyHint="send"
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          'min-w-0 flex-1 resize-none self-center bg-transparent text-ink-900 outline-none placeholder:text-ink-400',
          hero ? 'py-2.5 text-body-lg leading-7' : 'py-2 text-body leading-6',
        )}
      />
      {busy && onStop ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="עצירת התשובה"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full bg-ink-900 text-white transition-colors hover:bg-ink-800',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
            hero ? 'size-12' : 'size-11',
          )}
        >
          <Square aria-hidden="true" className="size-4 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          // The hero shows "שאלו" from sm up; the name matches the visible label everywhere.
          aria-label={hero ? 'שאלו' : 'שליחת השאלה'}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary-600 font-semibold text-white shadow-brand transition-colors hover:bg-primary-700',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
            hero ? 'size-12 text-base sm:w-auto sm:px-5' : 'size-11',
          )}
        >
          {hero && <span className="hidden sm:inline">שאלו</span>}
          <ArrowLeft aria-hidden="true" className="size-5 ltr:rotate-180" />
        </button>
      )}
    </form>
  );
});

export default Composer;
