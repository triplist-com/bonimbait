import 'server-only';

import { getVideo } from '@/app/api/_lib/data';
import { createClient } from '@/lib/supabase/server';
import { classifyPath, contentKey, parseContentRef, buildContentPerformance, type ContentPerformance } from './content';
import { commandUserDb, selectAll } from './db';
import { LEAD_FACT_COLUMNS, toLeadFact, type RawLeadRow } from './leads';
import { periodWindow } from './period';
import type { PeriodDays } from './types';

/** Content performance for a period, as the signed-in staff member (RLS). */
export async function loadContentPerformance(periodDays: PeriodDays, now = Date.now()): Promise<ContentPerformance & { period: { days: PeriodDays; from: string; to: string } }> {
  const window = periodWindow(now, periodDays);
  const nowIso = new Date(now).toISOString();
  const cdb = commandUserDb();
  const db = createClient();
  const [paths, cited, leadRows] = await Promise.all([
    cdb.rpc('command_top_paths', { p_from: window.from, p_to: nowIso, p_limit: 300 }).then((r) => (r.error ? (console.error(`[command] top paths: ${r.error.message}`), []) : r.data ?? [])),
    cdb.rpc('command_cited_sources', { p_from: window.from, p_to: nowIso, p_limit: 100 }).then((r) => (r.error ? (console.error(`[command] cited sources: ${r.error.message}`), []) : r.data ?? [])),
    selectAll<RawLeadRow>((from, to) =>
      db
        .from('leads')
        .select(LEAD_FACT_COLUMNS)
        .gte('created_at', window.from)
        .lt('created_at', nowIso)
        .range(from, to) as unknown as PromiseLike<{ data: RawLeadRow[] | null; error: { message: string } | null }>,
    ).catch((err) => {
      console.error(`[command] content leads: ${err instanceof Error ? err.message : String(err)}`);
      return [] as RawLeadRow[];
    }),
  ]);
  const empty = new Map<string, string>();
  const leads = leadRows.map((r) => toLeadFact(r, { regionSlugById: empty, planSlugById: empty, firstResponseAt: empty }));

  // Every piece of content mentioned, so titles resolve in one pass.
  const videoIds = new Set<string>();
  const postSlugs = new Set<string>();
  const add = (c: { kind: 'video' | 'post'; id: string } | null) => {
    if (c?.kind === 'video') videoIds.add(c.id);
    else if (c?.kind === 'post') postSlugs.add(c.id);
  };
  paths.forEach((p) => add(classifyPath(p.path)));
  cited.forEach((s) => add(parseContentRef(s.source_id)));
  leads.forEach((l) => {
    add(l.source.medium === 'ai_source' ? parseContentRef(l.source.source) : null);
    add(classifyPath(l.sourcePath));
  });

  const titles = new Map<string, { title: string; href: string }>();
  const legacy: string[] = [];
  for (const id of Array.from(videoIds)) {
    const v = getVideo(id);
    if (v) titles.set(contentKey('video', id), { title: v.title, href: `/video/${id}/` });
    else legacy.push(id);
  }
  const [legacyRows, postRows] = await Promise.all([
    legacy.length
      ? db.from('video_pages').select('legacy_slug, title').in('legacy_slug', legacy.slice(0, 300)).then((r) => r.data ?? [])
      : Promise.resolve([] as { legacy_slug: string; title: string }[]),
    postSlugs.size
      ? db.from('posts').select('slug, title').in('slug', Array.from(postSlugs).slice(0, 300)).then((r) => r.data ?? [])
      : Promise.resolve([] as { slug: string; title: string }[]),
  ]);
  for (const v of legacyRows) titles.set(contentKey('video', v.legacy_slug), { title: v.title, href: `/video/${v.legacy_slug}/` });
  for (const p of postRows) titles.set(contentKey('post', p.slug), { title: p.title, href: `/${p.slug}/` });

  // Paths that don't resolve to a real post are other pages (/<page-slug>/): leave them out.
  const known = (kind: 'video' | 'post', id: string) => kind === 'video' || titles.has(contentKey(kind, id));
  const perf = buildContentPerformance({
    topPaths: paths.filter((p) => {
      const c = classifyPath(p.path);
      return c ? known(c.kind, c.id) : false;
    }),
    cited,
    leads,
    titles,
  });
  return { ...perf, period: { days: periodDays, from: window.from, to: nowIso } };
}
