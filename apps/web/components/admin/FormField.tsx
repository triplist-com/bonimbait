import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const inputClass =
  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500';

/**
 * Labelled form control wrapper: label, control, hint and error. Works in
 * server and client components.
 */
export default function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ms-0.5 text-red-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select {...props} className={`${inputClass} ${props.className ?? ''}`}>
      {children}
    </select>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary-100" />
      {label}
    </label>
  );
}

/** Card section inside forms. */
export function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
