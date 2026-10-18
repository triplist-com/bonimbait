import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Checkbox, Radio and Switch: native inputs (keyboard, forms and screen
 * readers work as-is), branded with accent-color and logical layout.
 */

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  /** Card-style option (bordered, highlights when checked). */
  card?: boolean;
}

function choiceWrapper(card: boolean | undefined, disabled: boolean | undefined, className?: string) {
  return cn(
    'group flex cursor-pointer items-start gap-3 text-start',
    card &&
      'rounded-2xl border border-ink-200 bg-white p-4 transition-colors hover:border-ink-300 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50/40 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary-600/15',
    disabled && 'cursor-not-allowed opacity-50',
    className,
  );
}

const inputBase =
  'mt-0.5 size-5 shrink-0 cursor-pointer accent-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed';

function Text({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-body-sm font-medium text-ink-900">{label}</span>
      {description && <span className="text-caption text-ink-500">{description}</span>}
    </span>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox(
  { label, description, card, className, disabled, ...rest },
  ref,
) {
  return (
    <label className={choiceWrapper(card, disabled, className)}>
      <input ref={ref} type="checkbox" disabled={disabled} className={cn(inputBase, 'rounded')} {...rest} />
      <Text label={label} description={description} />
    </label>
  );
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio(
  { label, description, card, className, disabled, ...rest },
  ref,
) {
  return (
    <label className={choiceWrapper(card, disabled, className)}>
      <input ref={ref} type="radio" disabled={disabled} className={inputBase} {...rest} />
      <Text label={label} description={description} />
    </label>
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> {
  label: ReactNode;
  description?: ReactNode;
}

/** On/off toggle: a checkbox with role="switch". The thumb moves towards the end side. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, disabled, ...rest },
  ref,
) {
  return (
    <label className={cn('flex w-fit cursor-pointer items-center gap-3', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input ref={ref} type="checkbox" role="switch" disabled={disabled} className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-6 w-11 shrink-0 items-center rounded-full bg-ink-300 p-0.5 transition-colors duration-200',
          'peer-checked:bg-primary-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-600',
          '[&>span]:transition-[margin] [&>span]:duration-200 peer-checked:[&>span]:ms-5',
        )}
      >
        <span className="size-5 rounded-full bg-white shadow-xs" />
      </span>
      <Text label={label} description={description} />
    </label>
  );
});
