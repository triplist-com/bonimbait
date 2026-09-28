/** Hebrew messages for Supabase Auth errors and auth-page query errors. */

export function authErrorMessage(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'האימייל או הסיסמה שגויים.';
  if (m.includes('email not confirmed')) return 'יש לאשר את כתובת האימייל דרך הקישור שנשלח אליכם.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'כתובת האימייל כבר רשומה. נסו להתחבר.';
  }
  if (m.includes('password') && (m.includes('at least') || m.includes('short'))) {
    return 'הסיסמה חייבת להכיל לפחות 8 תווים.';
  }
  if (m.includes('rate limit') || m.includes('too many')) return 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'כתובת האימייל אינה תקינה.';
  return 'אירעה שגיאה. נסו שוב.';
}

export const PAGE_ERRORS: Record<string, string> = {
  forbidden: 'אין לכם הרשאה לצפות בעמוד זה. התחברו עם משתמש מורשה.',
  callback: 'ההתחברות לא הושלמה. נסו שוב.',
  unavailable: 'ההתחברות אינה זמינה כרגע.',
};
