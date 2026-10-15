import { NextResponse, type NextRequest } from 'next/server';
import { checkRole } from '@/lib/auth/session';
import { isEnabled } from '@/lib/flags';
import { insightsConfig, refreshInsights } from '@/lib/command/insights/engine';
import { productionInsightsDeps } from '@/lib/command/insights/store';
import { isCommandServiceConfigured } from '@/lib/command/db';

/**
 * "רענון תובנות" in /admin/insights/: runs the content-gap engine once.
 * Editors and admins. Guarded by the daily AI budget, a per-run estimate and a
 * cooldown (lib/command/insights/engine.ts); writes with the service role
 * after the role check.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isEnabled('commandCenter')) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const auth = await checkRole('editor');
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.status });
  if (!isCommandServiceConfigured()) {
    return NextResponse.json({ ok: false, message: 'השרת לא מוגדר לכתיבת תובנות (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  }

  const result = await refreshInsights(productionInsightsDeps(), { triggeredBy: auth.profile.id, config: insightsConfig() });
  const status = result.ok ? 200 : result.reason === 'error' ? 500 : result.reason === 'budget' ? 503 : 429;
  return NextResponse.json(result, { status });
}
