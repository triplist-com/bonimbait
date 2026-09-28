'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { authErrorMessage } from '@/lib/auth/messages';
import { CONSTRUCTION_STAGES, MEMBER_REGIONS } from '@/lib/constants/community';
import GoogleButton from '@/components/auth/GoogleButton';
import { FormError, inputClass, labelClass, primaryButtonClass } from '@/components/auth/AuthCard';

const MIN_PASSWORD = 8;

export default function SignupForm({ next }: { next: string }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState('');
  const [region, setRegion] = useState('');
  const [whatsapp, setWhatsapp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function validate(): string | null {
    if (!fullName.trim()) return 'נא למלא שם מלא.';
    if (!email.trim()) return 'נא למלא כתובת אימייל.';
    if (password.length < MIN_PASSWORD) return `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD} תווים.`;
    if (!stage) return 'נא לבחור באיזה שלב אתם בבנייה.';
    if (!region) return 'נא לבחור אזור.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setLoading(true);

    const { data, error: signUpError } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback/?next=${encodeURIComponent(next)}`,
        // Read by the handle_new_user() DB trigger to fill the profile.
        data: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          construction_stage: stage,
          region,
          whatsapp_opt_in: whatsapp ? 'true' : 'false',
        },
      },
    });

    if (signUpError) {
      setError(authErrorMessage(signUpError.message));
      setLoading(false);
      return;
    }
    if (data.session) {
      // Email confirmation disabled: already signed in.
      window.location.assign(next);
      return;
    }
    setSentTo(email.trim());
    setLoading(false);
  }

  if (sentTo) {
    return (
      <div className="text-center space-y-3" role="status">
        <p className="text-lg font-semibold text-gray-900">כמעט סיימנו!</p>
        <p className="text-gray-600">
          שלחנו קישור לאישור ההרשמה אל{' '}
          <span dir="ltr" className="font-medium">{sentTo}</span>. לחצו עליו כדי להשלים את ההרשמה.
        </p>
      </div>
    );
  }

  // Stage + region picked before choosing Google are passed through the callback.
  const googleExtras: Record<string, string> = {};
  if (stage) googleExtras.stage = stage;
  if (region) googleExtras.region = region;

  return (
    <div className="space-y-5">
      <FormError message={error} />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="stage" className={labelClass}>באיזה שלב אתם?</label>
          <select id="stage" required value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
            <option value="">בחרו שלב</option>
            {CONSTRUCTION_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="region" className={labelClass}>אזור</label>
          <select id="region" required value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass}>
            <option value="">בחרו אזור</option>
            {MEMBER_REGIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>

        <GoogleButton next={next} extraParams={googleExtras} onError={setError} />

        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          או הרשמה עם אימייל
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <div>
          <label htmlFor="fullName" className={labelClass}>שם מלא</label>
          <input id="fullName" autoComplete="name" required value={fullName}
            onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>אימייל</label>
          <input id="email" type="email" dir="ltr" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={`${inputClass} text-start`} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>טלפון (לא חובה)</label>
          <input id="phone" type="tel" dir="ltr" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} className={`${inputClass} text-start`} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>סיסמה</label>
          <input id="password" type="password" dir="ltr" autoComplete="new-password" required
            minLength={MIN_PASSWORD} value={password}
            onChange={(e) => setPassword(e.target.value)} className={`${inputClass} text-start`} />
          <p className="mt-1 text-xs text-gray-500">לפחות {MIN_PASSWORD} תווים</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
          אשמח להצטרף לקבוצות הוואטסאפ של הקהילה ולקבל עדכונים
        </label>

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'נרשם...' : 'הרשמה'}
        </button>
        <p className="text-xs text-gray-500 text-center">
          בהרשמה אתם מסכימים ל
          <Link href="/terms/" className="text-primary hover:text-primary-700">תנאי השימוש</Link>
          {' '}ול
          <Link href="/privacy/" className="text-primary hover:text-primary-700">מדיניות הפרטיות</Link>.
        </p>
      </form>

      <p className="text-center text-sm text-gray-600">
        כבר רשומים?{' '}
        <Link href={`/login/?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:text-primary-700">
          התחברות
        </Link>
      </p>
    </div>
  );
}
