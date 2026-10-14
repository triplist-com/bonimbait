import { NextResponse } from 'next/server';
import { checkRole } from '@/lib/auth/session';
import { autopilotConfig } from '@/lib/autopilot/config';
import { asAutopilotDb } from '@/lib/autopilot/db';
import { runWatch } from '@/lib/autopilot/run';
import { supabaseStore } from '@/lib/autopilot/store';
import { createClient } from '@/lib/supabase/server';

/** "Check channel now" in /admin/autopilot/: detection only, as the signed-in staff member (RLS). */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST() {
  const auth = await checkRole('editor');
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.status });

  try {
    const store = supabaseStore(asAutopilotDb(createClient()));
    const report = await runWatch(store, { via: 'admin', config: { ...autopilotConfig(), autoProcess: false } });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    console.error('[autopilot] check failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'הבדיקה נכשלה. נסו שוב.' }, { status: 500 });
  }
}
