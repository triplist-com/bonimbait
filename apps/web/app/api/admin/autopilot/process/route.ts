import { NextResponse, type NextRequest } from 'next/server';
import { checkRole } from '@/lib/auth/session';
import { asAutopilotDb } from '@/lib/autopilot/db';
import { processSource } from '@/lib/autopilot/pipeline';
import { supabaseStore } from '@/lib/autopilot/store';
import { createClient } from '@/lib/supabase/server';

/**
 * Process (or retry) one source: captions -> chunks -> embeddings -> summary
 * -> indexed. Runs as the signed-in staff member (RLS). Pipeline outcomes,
 * including "needs a transcript" and budget refusals, come back as 200 JSON.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await checkRole('editor');
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'מזהה לא תקין.' }, { status: 400 });

  try {
    const outcome = await processSource(id, { store: supabaseStore(asAutopilotDb(createClient())) });
    return NextResponse.json(outcome);
  } catch (err) {
    console.error('[autopilot] process failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'העיבוד נכשל. נסו שוב.' }, { status: 500 });
  }
}
