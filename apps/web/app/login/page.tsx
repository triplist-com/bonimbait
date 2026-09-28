import type { Metadata } from 'next';
import AuthCard from '@/components/auth/AuthCard';
import { PAGE_ERRORS } from '@/lib/auth/messages';
import { safeNextPath } from '@/lib/auth/roles';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'התחברות',
  robots: { index: false, follow: true },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNextPath(searchParams.next);
  const errorKey = searchParams.error;
  const initialError = errorKey ? PAGE_ERRORS[errorKey] ?? PAGE_ERRORS.callback : null;

  return (
    <AuthCard title="התחברות" subtitle="ברוכים השבים לקהילת בונים בית">
      {isSupabaseConfigured() ? (
        <LoginForm next={next} initialError={initialError} />
      ) : (
        <p className="text-center text-gray-500">{PAGE_ERRORS.unavailable}</p>
      )}
    </AuthCard>
  );
}
