import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface FieldProps {
  label: ReactNode;
  /** Help text under the control (linked with aria-describedby). */
  hint?: ReactNode;
  /** Error message: marks the control aria-invalid and is announced with it. */
  error?: ReactNode;
  required?: boolean;
  /** Shows "(רשות)" next to the label instead of the required star. */
  optional?: boolean;
  /** Control id; generated when omitted. */
  id?: string;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Exactly one control: Input, Textarea, Select or a native element. */
  children: ReactElement;
  className?: string;
}

/**
 * Label + control + hint + error, wired for screen readers.
 * Server-safe: it clones its single child with id / aria-describedby /
 * aria-invalid / required, so any control works.
 *
 *   <Field label="טלפון" hint="נחזור אליכם תוך יום עבודה" error={errors.phone} required>
 *     <Input type="tel" name="phone" inputMode="tel" dir="ltr" />
 *   </Field>
 */
export function Field({ label, hint, error, required, optional, id, hideLabel, children, className }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f${auto.replace(/:/g, '')}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const child = Children.only(children);
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className={cn('text-sm font-semibold text-ink-800', hideLabel && 'sr-only')}>
        {label}
        {required && (
          <span className="ms-1 text-primary-700" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="ms-1.5 text-xs font-normal text-ink-500">(רשות)</span>}
      </label>
      {isValidElement(child)
        ? cloneElement(child as ReactElement<Record<string, unknown>>, {
            id: controlId,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
            required: required || undefined,
          })
        : child}
      {hint && (
        <p id={hintId} className="text-caption text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-caption font-medium text-danger-700" role="alert">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
