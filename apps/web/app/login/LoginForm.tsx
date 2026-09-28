'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { authErrorMessage } from '@/lib/auth/messages';
import GoogleButton from '@/components/auth/GoogleButton';
import { FormError, inputClass, labelClass, primaryButtonClass } from '@/components/auth/AuthCard';

export default function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(authErrorMessage(signInError.message));
      setLoading(false);
      return;
    }
    // Full navigation so Server Components render with the new session cookie.
    window.location.assign(next);
  }

  return (
    <div className="space-y-5">
      <FormError message={error} />

      <GoogleButton next={next} onError={setError} />

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        או עם אימייל
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className={labelClass}>אימייל</label>
          <input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} text-start`}
          />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>סיסמה</label>
          <input
            id="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} text-start`}
          />
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'מתחבר...' : 'התחברות'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-600">
        עדיין אין לכם חשבון?{' '}
        <Link href={`/signup/?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:text-primary-700">
          הרשמה לקהילה
        </Link>
      </p>
    </div>
  );
}
