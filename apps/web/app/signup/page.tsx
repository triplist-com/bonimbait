import type { Metadata } from 'next';
import AuthCard from '@/components/auth/AuthCard';
import { PAGE_ERRORS } from '@/lib/auth/messages';
import { safeNextPath } from '@/lib/auth/roles';
import { isEnabled } from '@/lib/flags';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import SignupForm from './SignupForm';

export const metadata: Metadata = {
  title: 'הרשמה לקהילה',
  description: 'הצטרפו לקהילת בונים בית — מידע, המלצות וליווי לכל שלבי בניית הבית הפרטי.',
  robots: { index: false, follow: true },
};

export default function SignupPage({ searchParams }: { searchParams: { next?: string } }) {
  // New members land in "הבית שלי" (it starts with the 60-second map).
  const hub = isEnabled('hub');
  const next = safeNextPath(searchParams.next, hub ? '/my-home/' : '/');
  const forHub = hub && next.startsWith('/my-home');

  return (
    <AuthCard
      title={forHub ? 'שמרו את הבית שלכם' : 'הצטרפות לקהילה'}
      subtitle={forHub ? 'חשבון חינם: המפה, התקציב והמסמכים שלכם, מכל מכשיר' : 'ספרו לנו איפה אתם בתהליך ונתאים לכם תוכן והמלצות'}
    >
      {isSupabaseConfigured() ? (
        <SignupForm next={next} />
      ) : (
        <p className="text-center text-ink-500">{PAGE_ERRORS.unavailable}</p>
      )}
    </AuthCard>
  );
}
