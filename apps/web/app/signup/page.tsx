import type { Metadata } from 'next';
import AuthCard from '@/components/auth/AuthCard';
import { PAGE_ERRORS } from '@/lib/auth/messages';
import { safeNextPath } from '@/lib/auth/roles';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import SignupForm from './SignupForm';

export const metadata: Metadata = {
  title: 'הרשמה לקהילה',
  description: 'הצטרפו לקהילת בונים בית — מידע, המלצות וליווי לכל שלבי בניית הבית הפרטי.',
  robots: { index: false, follow: true },
};

export default function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNextPath(searchParams.next);

  return (
    <AuthCard title="הצטרפות לקהילה" subtitle="ספרו לנו איפה אתם בתהליך ונתאים לכם תוכן והמלצות">
      {isSupabaseConfigured() ? (
        <SignupForm next={next} />
      ) : (
        <p className="text-center text-gray-500">{PAGE_ERRORS.unavailable}</p>
      )}
    </AuthCard>
  );
}
