import 'server-only';

import type { AutopilotDb } from './db';
import { assertTransition } from './status';
import {
  SOURCE_LIST_COLUMNS,
  type AutopilotDatabase,
  type KnowledgeChunkRow,
  type KnowledgeSourceRow,
  type SourceKind,
  type SourceListRow,
  type SourceStatus,
} from './types';

type SourceInsert = AutopilotDatabase['public']['Tables']['knowledge_sources']['Insert'];
export type SourcePatch = Partial<Omit<KnowledgeSourceRow, 'id' | 'status' | 'created_at' | 'updated_at'>>;
export type ChunkInsert = Pick<KnowledgeChunkRow, 'chunk_index' | 'start_s' | 'end_s' | 'text' | 'embedding' | 'tokens'>;

/**
 * Data access for the pipeline, detection and cron. An interface so tests
 * drive the pipeline against an in-memory store; `supabaseStore()` is the
 * real one (with the caller's RLS client, or the service client for cron).
 */
export interface SourceStore {
  get(id: string): Promise<KnowledgeSourceRow | null>;
  /**
   * Compare-and-set status change: applies only while the row is still in
   * `from`. Returns the updated row, or null when another request moved it first.
   */
  transition(id: string, from: SourceStatus, to: SourceStatus, patch?: SourcePatch): Promise<KnowledgeSourceRow | null>;
  /** Non-status fields (e.g. a budget message). */
  update(id: string, patch: SourcePatch): Promise<void>;
  replaceChunks(sourceId: string, chunks: ChunkInsert[]): Promise<void>;
  existingExternalIds(kind: SourceKind, externalIds: string[]): Promise<Set<string>>;
  /** Insert new `detected` rows, ignoring ones that already exist. Returns the inserted ids. */
  insertDetected(rows: SourceInsert[]): Promise<Array<{ id: string; external_id: string }>>;
  listByStatus(status: SourceStatus, limit: number): Promise<KnowledgeSourceRow[]>;
  /** Sum of cost_usd_micros of sources processed in the last 30 days. */
  spentLast30dMicros(now?: Date): Promise<number>;
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`[autopilot] ${what}: ${error?.message ?? 'unknown error'}`);
}

export function supabaseStore(db: AutopilotDb): SourceStore {
  return {
    async get(id) {
      const { data, error } = await db.from('knowledge_sources').select('*').eq('id', id).maybeSingle();
      if (error) fail('load source', error);
      return (data as KnowledgeSourceRow | null) ?? null;
    },

    async transition(id, from, to, patch = {}) {
      assertTransition(from, to);
      const { data, error } = await db
        .from('knowledge_sources')
        .update({ ...patch, status: to })
        .eq('id', id)
        .eq('status', from)
        .select('*')
        .maybeSingle();
      if (error) fail(`status ${from} -> ${to}`, error);
      return (data as KnowledgeSourceRow | null) ?? null;
    },

    async update(id, patch) {
      const { error } = await db.from('knowledge_sources').update(patch).eq('id', id);
      if (error) fail('update source', error);
    },

    async replaceChunks(sourceId, chunks) {
      const del = await db.from('knowledge_chunks').delete().eq('source_id', sourceId);
      if (del.error) fail('delete chunks', del.error);
      if (chunks.length === 0) return;
      const { error } = await db.from('knowledge_chunks').insert(chunks.map((c) => ({ ...c, source_id: sourceId })));
      if (error) fail('insert chunks', error);
    },

    async existingExternalIds(kind, externalIds) {
      if (externalIds.length === 0) return new Set();
      const { data, error } = await db
        .from('knowledge_sources')
        .select('external_id')
        .eq('kind', kind)
        .in('external_id', externalIds);
      if (error) fail('lookup sources', error);
      return new Set((data ?? []).map((r) => r.external_id));
    },

    async insertDetected(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await db
        .from('knowledge_sources')
        .upsert(
          rows.map((r) => ({ ...r, status: 'detected' as const })),
          { onConflict: 'kind,external_id', ignoreDuplicates: true },
        )
        .select('id, external_id');
      if (error) fail('insert detected sources', error);
      return (data ?? []) as Array<{ id: string; external_id: string }>;
    },

    async listByStatus(status, limit) {
      const { data, error } = await db
        .from('knowledge_sources')
        .select('*')
        .eq('status', status)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) fail('list sources', error);
      return (data ?? []) as KnowledgeSourceRow[];
    },

    async spentLast30dMicros(now = new Date()) {
      const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await db
        .from('knowledge_sources')
        .select('cost_usd_micros')
        .gte('processed_at', since)
        .gt('cost_usd_micros', 0)
        .limit(5000);
      if (error) fail('read spend', error);
      return (data ?? []).reduce((n, r) => n + Number(r.cost_usd_micros || 0), 0);
    },
  };
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export async function listSources(
  db: AutopilotDb,
  opts: { status?: SourceStatus | null; page?: number; pageSize?: number } = {},
): Promise<{ rows: SourceListRow[]; total: number }> {
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 30));
  const page = Math.max(1, opts.page ?? 1);
  let query = db
    .from('knowledge_sources')
    .select(SOURCE_LIST_COLUMNS, { count: 'exact' })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (opts.status) query = query.eq('status', opts.status);
  const { data, count, error } = await query;
  if (error) fail('list sources', error);
  return { rows: (data ?? []) as unknown as SourceListRow[], total: count ?? 0 };
}

export async function statusCounts(db: AutopilotDb): Promise<Partial<Record<SourceStatus, number>>> {
  const { data, error } = await db.from('knowledge_sources').select('status').limit(10_000);
  if (error) fail('count sources', error);
  const out: Partial<Record<SourceStatus, number>> = {};
  for (const r of data ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

export async function listChunks(db: AutopilotDb, sourceId: string, limit = 50) {
  const { data, error } = await db
    .from('knowledge_chunks')
    .select('id, chunk_index, start_s, end_s, text, tokens')
    .eq('source_id', sourceId)
    .order('chunk_index')
    .limit(limit);
  if (error) fail('list chunks', error);
  return data ?? [];
}
