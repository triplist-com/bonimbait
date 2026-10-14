'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

const BUCKET = 'autopilot-audio';
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Transcript strategy (c) (AUTOPILOT_AUDIO_TRANSCRIPTION=true): upload an audio
 * file straight to the private storage bucket with the staff session (no
 * serverless body limit), then ask the server to transcribe it.
 */
export default function AudioUpload({ id, estimate }: { id: string; estimate: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setNote({ ok: false, text: 'הקובץ גדול מ-25MB. דחסו אותו (למשל MP3 מונו 64kbps) ונסו שוב.' });
      return;
    }
    setBusy(true);
    setNote({ ok: true, text: 'מעלה את הקובץ…' });
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'audio';
      const path = `${id}/${Date.now()}-${safe}`;
      const { error } = await createClient().storage.from(BUCKET).upload(path, file, { contentType: file.type || 'audio/mpeg' });
      if (error) throw new Error(error.message);
      setNote({ ok: true, text: 'מתמלל… (עד דקה)' });
      const res = await fetch('/api/admin/autopilot/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, path }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; cues?: number } | null;
      setNote(data?.ok ? { ok: true, text: `התמלול הושלם (${data.cues} שורות). עכשיו אפשר לעבד.` } : { ok: false, text: data?.error ?? 'התמלול נכשל.' });
      router.refresh();
    } catch (err) {
      setNote({ ok: false, text: `ההעלאה נכשלה: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-3">
      <label className="block text-sm font-medium text-gray-700" htmlFor={`audio-${id}`}>
        תמלול מקובץ שמע (OpenAI)
      </label>
      <p className="mb-2 mt-0.5 text-xs text-gray-500">MP3/M4A/WAV עד 25MB. עלות משוערת: {estimate}.</p>
      <input
        id={`audio-${id}`}
        type="file"
        accept="audio/*,video/mp4"
        disabled={busy}
        onChange={onChange}
        className="block w-full text-sm text-gray-700 file:me-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
      />
      <p aria-live="polite" className={`mt-2 text-sm empty:hidden ${note?.ok === false ? 'text-red-700' : 'text-gray-600'}`}>
        {note?.text ?? ''}
      </p>
    </div>
  );
}
