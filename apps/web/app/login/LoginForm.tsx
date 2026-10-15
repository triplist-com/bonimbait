'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { authErrorMessage } from '@/lib/auth/messages';
import GoogleButton from '@/components/auth/GoogleButton';
import { FormError } from '@/components/auth/AuthCard';
import { importLocalHubNow } from '@/components/hub/importLocal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

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
    // A map or saved items from before signing in move into the account.
    await importLocalHubNow();
    // Full navigation so Server Components render with the new session cookie.
    window.location.assign(next);
  }

  return (
    <div className="space-y-5">
      <FormError message={error} />

      <GoogleButton next={next} onError={setError} />

      <div className="flex items-center gap-3 text-caption text-ink-500">
        <span className="h-px flex-1 bg-ink-200" />
        או עם אימייל
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="אימייל" id="email">
          <Input
            type="email"
            dir="ltr"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-start"
          />
        </Field>
        <Field label="סיסמה" id="password">
          <Input
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="text-start"
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={loading} iconStart={<LogIn />}>
          {loading ? 'מתחברים…' : 'התחברות'}
        </Button>
      </form>

      <p className="text-center text-body-sm text-ink-600">
        עדיין אין לכם חשבון?{' '}
        <Link href={`/signup/?next=${encodeURIComponent(next)}`} className="font-semibold text-primary-700 hover:underline">
          הרשמה בחינם
        </Link>
      </p>
    </div>
  );
}
