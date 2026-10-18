'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, UserRoundPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { authErrorMessage } from '@/lib/auth/messages';
import { track } from '@/lib/analytics/track';
import { CONSTRUCTION_STAGES, MEMBER_REGIONS } from '@/lib/constants/community';
import { BUILD_STAGES } from '@/lib/stages';
import { readLocalHubRaw } from '@/lib/hub/local-saved';
import { completeSignupAction } from '@/app/my-home/actions';
import GoogleButton from '@/components/auth/GoogleButton';
import { FormError } from '@/components/auth/AuthCard';
import { importLocalHubNow } from '@/components/hub/importLocal';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Choice';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';

const MIN_PASSWORD = 8;

type LocalMap = { stage: string; regionSlug: string; stageLabel: string; regionName: string; profileStage: string; raw: unknown };

/** The visitor's onboarding map in this browser (bb.hub.draft), if it has a stage and a region. */
function readLocalMap(): LocalMap | null {
  const raw = readLocalHubRaw().draft;
  if (!raw || typeof raw !== 'object') return null;
  const { stage, regionSlug } = raw as { stage?: unknown; regionSlug?: unknown };
  const buildStage = BUILD_STAGES.find((s) => s.id === stage);
  const region = MEMBER_REGIONS.find((r) => r.slug === regionSlug);
  if (!buildStage || !region) return null;
  // The profile enum is coarser than the 7 stages: infrastructure counts as frame.
  const profileStage = buildStage.profileStage ?? (buildStage.id === 'infrastructure' ? 'frame' : '');
  return { stage: buildStage.id, regionSlug: region.slug, stageLabel: buildStage.label, regionName: region.name, profileStage, raw };
}

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
  const [map, setMap] = useState<LocalMap | null>(null);
  const [editMap, setEditMap] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const local = readLocalMap();
    if (!local) return;
    setMap(local);
    setStage(local.profileStage);
    setRegion(local.regionSlug);
  }, []);

  function markStarted(method: 'email' | 'google') {
    if (started) return;
    setStarted(true);
    track('signup_started', { method, source: map ? 'hub_map' : next.startsWith('/my-home') ? 'hub' : 'site' });
  }

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
    markStarted('email');
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
        // Read by the handle_new_user() DB trigger to fill the profile; the
        // hub map rides along so a confirmation on another device still finds it.
        data: {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          construction_stage: stage,
          region,
          whatsapp_opt_in: whatsapp ? 'true' : 'false',
          ...(map ? { hub_draft: map.raw } : {}),
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
      await completeSignupAction().catch(() => undefined);
      await importLocalHubNow();
      window.location.assign(next);
      return;
    }
    setSentTo(email.trim());
    setLoading(false);
  }

  if (sentTo) {
    return (
      <div className="space-y-3 text-center" role="status">
        <p className="text-title-lg text-ink-900">כמעט סיימנו!</p>
        <p className="text-body text-ink-600">
          שלחנו קישור לאישור ההרשמה אל{' '}
          <span dir="ltr" className="font-semibold text-ink-900">
            {sentTo}
          </span>
          . לחצו עליו כדי להשלים את ההרשמה{map ? ', והמפה שלכם תחכה בחשבון' : ''}.
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
        {map && !editMap ? (
          <div className="flex items-start gap-3 rounded-2xl bg-success-50 p-4 text-body-sm text-success-800 ring-1 ring-inset ring-success-100">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-600" />
            <p>
              <strong className="font-bold">המפה שלכם מוכנה ונשמור אותה בחשבון.</strong> שלב {map.stageLabel} · {map.regionName}.{' '}
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setEditMap(true)}>
                שינוי
              </button>
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="באיזה שלב אתם?" id="stage" required>
              <Select value={stage} onChange={(e) => setStage(e.target.value)} placeholder="בחרו שלב">
                {CONSTRUCTION_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="אזור" id="region" required>
              <Select value={region} onChange={(e) => setRegion(e.target.value)} placeholder="בחרו אזור">
                {MEMBER_REGIONS.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <GoogleButton next={next} extraParams={googleExtras} onError={setError} onStart={() => markStarted('google')} />

        <div className="flex items-center gap-3 text-caption text-ink-500">
          <span className="h-px flex-1 bg-ink-200" />
          או הרשמה עם אימייל
          <span className="h-px flex-1 bg-ink-200" />
        </div>

        <Field label="שם מלא" id="fullName" required>
          <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} onFocus={() => markStarted('email')} />
        </Field>
        <Field label="אימייל" id="email" required>
          <Input
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => markStarted('email')}
            className="text-start"
          />
        </Field>
        <Field label="טלפון" id="phone" optional>
          <Input type="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-start" />
        </Field>
        <Field label="סיסמה" id="password" required hint={`לפחות ${MIN_PASSWORD} תווים`}>
          <Input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="text-start"
          />
        </Field>
        <Checkbox
          checked={whatsapp}
          onChange={(e) => setWhatsapp(e.target.checked)}
          label="אשמח להצטרף לקבוצות הוואטסאפ של הקהילה ולקבל עדכונים"
        />

        <Button type="submit" size="lg" fullWidth loading={loading} iconStart={<UserRoundPlus />}>
          {loading ? 'נרשמים…' : map ? 'הרשמה ושמירת המפה' : 'הרשמה'}
        </Button>
        <p className="text-center text-caption text-ink-500">
          בהרשמה אתם מסכימים ל
          <Link href="/terms/" className="text-primary-700 hover:underline">
            תנאי השימוש
          </Link>{' '}
          ול
          <Link href="/privacy/" className="text-primary-700 hover:underline">
            מדיניות הפרטיות
          </Link>
          .
        </p>
      </form>

      <p className="text-center text-body-sm text-ink-600">
        כבר רשומים?{' '}
        <Link href={`/login/?next=${encodeURIComponent(next)}`} className="font-semibold text-primary-700 hover:underline">
          התחברות
        </Link>
      </p>
    </div>
  );
}
