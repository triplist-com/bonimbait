import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env';

/**
 * Refresh the Supabase session cookie on every request (edge middleware).
 * Returns the response to continue with (carrying refreshed cookies) and the
 * verified user, if any.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null }> {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return { response, user: null };

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() validates the JWT with Supabase Auth and refreshes it if needed.
  // Without an auth cookie it returns immediately (no network call).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
