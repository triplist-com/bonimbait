import { NextResponse, type NextRequest } from 'next/server';
import { checkRole } from '@/lib/auth/session';
import { AUDIO_BUCKET, AUDIO_MAX_BYTES, estimateAudioMicros, isAudioTranscriptionEnabled, transcribeAudio } from '@/lib/autopilot/audio';
import { getBudgetGuard } from '@/lib/autopilot/cost';
import { asAutopilotDb } from '@/lib/autopilot/db';
import { ManageError, applyTranscript } from '@/lib/autopilot/manage';
import { canReplaceTranscript } from '@/lib/autopilot/status';
import { supabaseStore } from '@/lib/autopilot/store';
import { createClient } from '@/lib/supabase/server';

/**
 * Transcript strategy (c), only with AUTOPILOT_AUDIO_TRANSCRIPTION=true:
 * transcribe an audio file staff uploaded to the private `autopilot-audio`
 * bucket (path `<source id>/<file>`), then delete the file.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isAudioTranscriptionEnabled()) return NextResponse.json({ error: 'not enabled' }, { status: 404 });
  const auth = await checkRole('editor');
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { id?: unknown; path?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const path = typeof body?.path === 'string' ? body.path : '';
  if (!UUID.test(id) || !path.startsWith(`${id}/`) || path.includes('..')) {
    return NextResponse.json({ ok: false, error: 'בקשה לא תקינה.' }, { status: 400 });
  }

  const supabase = createClient();
  const store = supabaseStore(asAutopilotDb(supabase));
  try {
    const src = await store.get(id);
    if (!src) return NextResponse.json({ ok: false, error: 'הפריט לא נמצא.' }, { status: 404 });
    if (!canReplaceTranscript(src.status, src.updated_at)) {
      return NextResponse.json({ ok: false, error: 'אי אפשר להחליף תמליל במצב הנוכחי.' }, { status: 409 });
    }

    const { data: file, error } = await supabase.storage.from(AUDIO_BUCKET).download(path);
    if (error || !file) return NextResponse.json({ ok: false, error: 'קובץ השמע לא נמצא.' }, { status: 404 });
    if (file.size > AUDIO_MAX_BYTES) return NextResponse.json({ ok: false, error: 'הקובץ גדול מ-25MB.' }, { status: 413 });

    const guard = getBudgetGuard(() => store.spentLast30dMicros());
    const label = `audio:${src.external_id}`;
    const decision = await guard.check({ label, usdMicros: estimateAudioMicros(src.duration_s, file.size) });
    if (!decision.ok) return NextResponse.json({ ok: false, code: 'budget', error: decision.reason });

    const result = await transcribeAudio(file, path.split('/').pop() || 'audio');
    await guard.record({ label, usdMicros: result.usage.usd_micros, sourceId: id });
    await applyTranscript(store, id, {
      cues: result.cues,
      source: 'audio_transcription',
      durationS: Math.round(result.durationS),
      usage: result.usage,
    });
    await supabase.storage.from(AUDIO_BUCKET).remove([path]);
    return NextResponse.json({ ok: true, status: 'transcribed', cues: result.cues.length, costMicros: result.usage.usd_micros });
  } catch (err) {
    if (err instanceof ManageError) return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    console.error('[autopilot] audio transcription failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'התמלול נכשל. נסו שוב.' }, { status: 500 });
  }
}
