/**
 * In-memory SourceStore for pipeline / detection / route tests. Mirrors the
 * Supabase store's semantics: compare-and-set transitions (validated against
 * the status machine) and (kind, external_id) uniqueness.
 */
import type { ChunkInsert, SourcePatch, SourceStore } from '@/lib/autopilot/store';
import { assertTransition } from '@/lib/autopilot/status';
import type { KnowledgeSourceRow, SourceStatus } from '@/lib/autopilot/types';

export function sourceRow(over: Partial<KnowledgeSourceRow> = {}): KnowledgeSourceRow {
  const now = new Date('2026-10-14T10:00:00Z').toISOString();
  return {
    id: over.id ?? `src-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'youtube',
    external_id: 'EeMos4VM2oU',
    title: 'חיפוי אבן פראית: כמה זה עולה?',
    url: 'https://www.youtube.com/watch?v=EeMos4VM2oU',
    published_at: '2026-10-11T18:30:05.000Z',
    duration_s: null,
    thumbnail_url: null,
    status: 'detected',
    error: null,
    transcript_source: null,
    transcript_text: null,
    transcript_cues: null,
    summary: null,
    chunk_count: 0,
    cost_usd_micros: 0,
    usage: [],
    attempts: 0,
    is_demo: false,
    detected_via: 'cron',
    processed_at: null,
    site_published_at: null,
    published_by: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

export function memoryStore(initial: KnowledgeSourceRow[] = [], opts: { spent?: number } = {}) {
  const rows = new Map(initial.map((r) => [r.id, { ...r }]));
  const chunks = new Map<string, ChunkInsert[]>();
  const history: Array<{ id: string; from: SourceStatus; to: SourceStatus }> = [];
  let seq = 0;

  const store: SourceStore = {
    async get(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async transition(id, from, to, patch: SourcePatch = {}) {
      assertTransition(from, to);
      const r = rows.get(id);
      if (!r || r.status !== from) return null;
      Object.assign(r, patch, { status: to, updated_at: new Date().toISOString() });
      history.push({ id, from, to });
      return { ...r };
    },
    async update(id, patch) {
      const r = rows.get(id);
      if (r) Object.assign(r, patch);
    },
    async replaceChunks(sourceId, list) {
      chunks.set(sourceId, list);
    },
    async existingExternalIds(kind, ids) {
      const set = new Set<string>();
      rows.forEach((r) => {
        if (r.kind === kind && ids.includes(r.external_id)) set.add(r.external_id);
      });
      return set;
    },
    async insertDetected(list) {
      const out: Array<{ id: string; external_id: string }> = [];
      for (const r of list) {
        const exists = Array.from(rows.values()).some((x) => x.kind === r.kind && x.external_id === r.external_id);
        if (exists) continue;
        const id = `new-${++seq}`;
        rows.set(id, sourceRow({ ...r, id, status: 'detected' }));
        out.push({ id, external_id: r.external_id });
      }
      return out;
    },
    async listForQueue(filter, limit) {
      return Array.from(rows.values())
        .filter(
          (r) =>
            r.status === filter.status &&
            (!filter.kind || r.kind === filter.kind) &&
            (!filter.errorSuffix || (r.error ?? '').endsWith(filter.errorSuffix)) &&
            (filter.maxAttempts === undefined || r.attempts < filter.maxAttempts),
        )
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async spentLast30dMicros() {
      return opts.spent ?? 0;
    },
  };
  return { store, rows, chunks, history };
}
