import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { applySignupExtras, syncProfile } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * Auth callback for:
 *  - OAuth (Google): ?code=...
 *  - Email confirmation / magic link / recovery: ?token_hash=...&type=...
 * Optional: ?next=/path/ (same-site only), ?stage=&region= (collected on the
 * signup page before a Google redirect).
 *
 * Add `<site>/auth/callback/` to Supabase Auth → URL Configuration → Redirect URLs.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get('next'));
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login/?error=${reason}`, request.url));

  if (!isSupabaseConfigured()) return fail('unavailable');

  const supabase = createClient();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  let error: { message: string } | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    return fail('callback');
  }
  if (error) return fail('callback');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Ensure the profile exists and ADMIN_EMAILS users are promoted.
    await syncProfile(user);
    await applySignupExtras(user.id, {
      stage: url.searchParams.get('stage'),
      region: url.searchParams.get('region'),
    });
  }

  return NextResponse.redirect(new URL(next, request.url));
}
