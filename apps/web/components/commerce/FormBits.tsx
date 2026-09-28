'use client';

import { useFormStatus } from 'react-dom';
import { inputClass, labelClass } from '@/components/auth/AuthCard';
import type { FieldErrors } from '@/lib/commerce/forms';

export function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const message = errors[name];
  if (!message) return null;
  return (
    <p id={`${name}-error`} role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}

export function TextField({
  name,
  label,
  type = 'text',
  errors,
  defaultValue,
  autoComplete,
  required = true,
  dir,
}: {
  name: string;
  label: string;
  type?: string;
  errors: FieldErrors;
  defaultValue?: string | null;
  autoComplete?: string;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
        autoComplete={autoComplete}
        dir={dir}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        className={inputClass}
      />
      <FieldError errors={errors} name={name} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  placeholder,
  options,
  errors,
  defaultValue,
  required = true,
}: {
  name: string;
  label: string;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  errors: FieldErrors;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ''}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError errors={errors} name={name} />
    </div>
  );
}

export function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        className ??
        'w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60'
      }
    >
      {pending ? 'שולח…' : children}
    </button>
  );
}

export function FormMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}
