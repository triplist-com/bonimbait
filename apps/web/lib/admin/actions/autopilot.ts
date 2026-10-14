'use server';

import { revalidatePath } from 'next/cache';
import { asAutopilotDb } from '@/lib/autopilot/db';
import {
  ManageError,
  applyTranscript,
  publishSource as publish,
  restoreSource as restore,
  saveSummary as storeSummary,
  skipSource as skip,
  unpublishSource as unpublish,
} from '@/lib/autopilot/manage';
import { revalidateRuntimeVideo } from '@/lib/autopilot/revalidate';
import { supabaseStore } from '@/lib/autopilot/store';
import { chaptersFromText, costsFromText, keyPointsFromText, listFromText } from '@/lib/autopilot/summary';
import { videoCategories } from '@/lib/autopilot/records';
import { FORMAT_SOURCE, TranscriptParseError, parseTranscript, type TranscriptFormat } from '@/lib/autopilot/transcript';
import { ActionError, adminAction, type AdminContext } from '../guard';
import { optStr, str, uuidOrNull } from '../form';

/**
 * Content Autopilot admin actions (/admin/autopilot/). Processing and
 * "check channel now" are route handlers (app/api/admin/autopilot/*) because
 * they run for up to a minute; these are the quick state changes.
 */

const MAX_TRANSCRIPT_BYTES = 900_000; // under the 1 MB server-action body limit

function storeOf(ctx: AdminContext) {
  return supabaseStore(asAutopilotDb(ctx.db));
}

function sourceId(fd: FormData): string {
  const id = uuidOrNull(optStr(fd, 'id'));
  if (!id) throw new ActionError('מזהה חסר.');
  return id;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ManageError || err instanceof TranscriptParseError) throw new ActionError(err.message);
    throw err;
  }
}

function refreshAdmin(id?: string) {
  revalidatePath('/admin/autopilot/');
  if (id) revalidatePath(`/admin/autopilot/${id}/`);
}

export const skipSource = adminAction('editor', async (ctx, fd: FormData) => {
  const id = sourceId(fd);
  await run(() => skip(storeOf(ctx), id));
  refreshAdmin(id);
  return { ok: true, message: 'הסרטון סומן כמדולג.' };
});

export const restoreSource = adminAction('editor', async (ctx, fd: FormData) => {
  const id = sourceId(fd);
  await run(() => restore(storeOf(ctx), id));
  refreshAdmin(id);
  return { ok: true, message: 'הסרטון הוחזר לתור.' };
});

export const publishSource = adminAction('editor', async (ctx, fd: FormData) => {
  const id = sourceId(fd);
  const src = await run(() => publish(storeOf(ctx), id, ctx.profile.id));
  revalidateRuntimeVideo(src.external_id);
  refreshAdmin(id);
  return { ok: true, message: 'פורסם! הסרטון מופיע עכשיו באתר ובחיפוש.' };
});

export const unpublishSource = adminAction('editor', async (ctx, fd: FormData) => {
  const id = sourceId(fd);
  const src = await run(() => unpublish(storeOf(ctx), id));
  revalidateRuntimeVideo(src.external_id);
  refreshAdmin(id);
  return { ok: true, message: 'הסרטון הוסר מהאתר ומהחיפוש.' };
});

/** Pasted text or an uploaded VTT/SRT/SBV/TXT/json3 file -> transcribed. */
export const saveTranscript = adminAction('editor', async (ctx, fd: FormData) => {
  const id = sourceId(fd);
  const file = fd.get('file');
  let content = '';
  let filename: string | null = null;
  if (file && typeof file === 'object' && 'text' in file && (file as File).size > 0) {
    if ((file as File).size > MAX_TRANSCRIPT_BYTES) throw new ActionError('הקובץ גדול מדי (עד 900KB).');
    content = await (file as File).text();
    filename = (file as File).name || null;
  } else {
    content = str(fd, 'text', MAX_TRANSCRIPT_BYTES);
  }
  if (!content.trim()) throw new ActionError('הדביקו תמליל או בחרו קובץ.', { text: 'חסר תמליל' });
  const chosen = str(fd, 'format', 10) as TranscriptFormat | '';
  const format = chosen && chosen in FORMAT_SOURCE ? chosen : undefined;

  const store = storeOf(ctx);
  const current = await store.get(id);
  const parsed = await run(async () => parseTranscript(content, { filename, format, durationS: current?.duration_s ?? null }));
  await run(() => applyTranscript(store, id, { cues: parsed.cues, source: FORMAT_SOURCE[parsed.format] }));
  refreshAdmin(id);
  return {
    ok: true,
    message: `התמליל נשמר (${parsed.cues.length} שורות, פורמט ${parsed.format.toUpperCase()}). עכשיו אפשר לעבד.`,
  };
});

/** Staff edits to the generated summary. */
export const saveSourceSummary = adminAction('editor', async (ctx, fd: FormData) => {
  const id = sourceId(fd);
  const categories = videoCategories();
  const { source } = await run(() =>
    storeSummary(
      storeOf(ctx),
      id,
      {
        summary: str(fd, 'summary', 3000),
        key_points: keyPointsFromText(str(fd, 'key_points', 8000)),
        chapters: chaptersFromText(str(fd, 'chapters', 8000)),
        costs: costsFromText(str(fd, 'costs', 8000)),
        tips: listFromText(str(fd, 'tips', 6000)),
        warnings: listFromText(str(fd, 'warnings', 6000)),
        suggested_questions: listFromText(str(fd, 'suggested_questions', 2000)),
        category_slug: str(fd, 'category_slug', 80),
        stage: str(fd, 'stage', 40),
      },
      { categorySlugs: categories.map((c) => c.slug) },
    ),
  );
  if (source.status === 'published') revalidateRuntimeVideo(source.external_id);
  refreshAdmin(id);
  return { ok: true, message: source.status === 'published' ? 'הסיכום נשמר ועודכן באתר.' : 'הסיכום נשמר.' };
});
