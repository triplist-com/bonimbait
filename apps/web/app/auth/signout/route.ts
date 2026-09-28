import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/** POST-only sign out (avoids logout via prefetch/GET links). */
export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    await createClient().auth.signOut();
  }
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
