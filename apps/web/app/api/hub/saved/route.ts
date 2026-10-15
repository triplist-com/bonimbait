import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { hubUserDb } from '@/lib/hub/db';
import { listSavedRefs } from '@/lib/hub/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hub/saved/ -> { signedIn, items: [{ kind, ref }] }
 * What the signed-in member saved, so the ♡ and shortlist buttons on static
 * (ISR) pages show the right state. One request per page, shared by every
 * button (components/hub/savedStore.ts). Private and never cached.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!isEnabled('hub') || !isSupabaseConfigured()) return NextResponse.json({ signedIn: false, items: [] }, { headers });
  const user = await getUser();
  if (!user) return NextResponse.json({ signedIn: false, items: [] }, { headers });
  try {
    const items = await listSavedRefs(hubUserDb(), user.id);
    return NextResponse.json({ signedIn: true, items }, { headers });
  } catch (err) {
    console.error('[hub] saved refs failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ signedIn: true, items: [] }, { status: 503, headers });
  }
}
