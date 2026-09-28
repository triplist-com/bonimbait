/** Shared frame for the login/signup pages. */
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-md mx-auto bg-white border border-gray-100 rounded-2xl shadow-card p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">{title}</h1>
        {subtitle && <p className="text-gray-500 text-center mb-6">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export const primaryButtonClass =
  'w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60';

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}
