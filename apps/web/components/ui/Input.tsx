import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ControlSize = 'md' | 'lg';

/** Shared look for text-like controls. Invalid state comes from aria-invalid. */
export function controlClasses(size: ControlSize = 'md', className?: string) {
  return cn(
    'w-full rounded-xl border border-ink-200 bg-white text-ink-900 shadow-xs outline-none transition-[border-color,box-shadow] duration-200',
    'placeholder:text-ink-400',
    'hover:border-ink-300 focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15',
    'aria-[invalid=true]:border-danger-600 aria-[invalid=true]:focus:ring-danger-600/15',
    'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
    size === 'lg' ? 'h-14 px-5 text-body-lg' : 'h-12 px-4 text-body',
    className,
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: ControlSize;
  /** Icon inside the field at the start (right in RTL), e.g. a search glass. */
  startIcon?: ReactNode;
  /** Icon or short text at the end (left in RTL), e.g. "₪" or "מ״ר". */
  endAdornment?: ReactNode;
  wrapperClassName?: string;
}

/** Text input. Use with <Field> for label, hint and error. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', startIcon, endAdornment, className, wrapperClassName, ...rest },
  ref,
) {
  if (!startIcon && !endAdornment) {
    return <input ref={ref} className={controlClasses(inputSize, className)} {...rest} />;
  }
  return (
    <div className={cn('relative', wrapperClassName)}>
      {startIcon && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-4 text-ink-400 [&_svg]:size-5">
          {startIcon}
        </span>
      )}
      <input
        ref={ref}
        className={controlClasses(inputSize, cn(startIcon ? (inputSize === 'lg' ? 'ps-12' : 'ps-11') : null, endAdornment ? 'pe-12' : null, className))}
        {...rest}
      />
      {endAdornment && (
        <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-4 text-sm font-medium text-ink-500 [&_svg]:size-5">
          {endAdornment}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  inputSize?: ControlSize;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { inputSize = 'md', className, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={controlClasses(inputSize, cn('h-auto resize-y py-3 leading-relaxed', className))} {...rest} />;
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  inputSize?: ControlSize;
  /** Placeholder option (value ""), shown first. */
  placeholder?: string;
  wrapperClassName?: string;
}

/** Native select (best on phones) with the system look. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { inputSize = 'md', placeholder, className, wrapperClassName, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select ref={ref} className={controlClasses(inputSize, cn('cursor-pointer appearance-none pe-11', className))} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
    </div>
  );
});
