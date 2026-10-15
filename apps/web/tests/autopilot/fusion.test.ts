/**
 * Runtime/static fusion in app/api/_lib/semantic.ts, end to end over a tiny
 * synthetic static index (fs is mocked for the index files only), a mocked
 * query embedding and a mocked match_knowledge_chunks RPC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeMatchRow } from '@/lib/autopilot/types';

const h = vi.hoisted(() => {
  const DIM = 4;
  const videos = [
    { youtube_id: 'AAAAAAAAAAA', segment_index: 0, start_time: 0, end_time: 150, text: 'יסודות ובטון לבית פרטי' },
    { youtube_id: 'BBBBBBBBBBB', segment_index: 0, start_time: 0, end_time: 170, text: 'ריצוף וטיח בשלב הגמרים' },
    { youtube_id: 'CCCCCCCCCCC', segment_index: 0, start_time: 0, end_time: 160, text: 'חשמל ותאורה' },
  ];
  const posts = [{ slug: 'post-1', title: 'מאמר', chunk_index: 0, text: 'מאמר על בטון' }];
  const f32 = (rows: number[][]) => Buffer.from(new Float32Array(rows.flat()).buffer);
  const files: Record<string, Buffer> = {
    'search-index.json': Buffer.from(JSON.stringify(videos)),
    'search-index.f32': f32([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ]),
    'posts-index.json': Buffer.from(JSON.stringify(posts)),
    'posts-index.f32': f32([[0.9, 0.1, 0, 0]]),
  };
  return {
    DIM,
    files,
    rpc: null as null | ((args: { query_embedding: string }, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>),
    rpcCalls: 0,
  };
});

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const synthetic = (p: unknown) => Object.keys(h.files).find((name) => String(p).endsWith(`/${name}`));
  const existsSync = (p: Parameters<typeof actual.existsSync>[0]) => (synthetic(p) ? true : actual.existsSync(p));
  const readFileSync = ((p: Parameters<typeof actual.readFileSync>[0], enc?: unknown) => {
    const name = synthetic(p);
    if (name) return enc ? h.files[name].toString() : h.files[name];
    return actual.readFileSync(p, enc as never);
  }) as typeof actual.readFileSync;
  const mocked = { ...actual, existsSync, readFileSync };
  return { ...mocked, default: mocked };
});

vi.mock('@/lib/autopilot/db', () => ({
  serviceDb: () =>
    h.rpc
      ? {
          rpc: (_name: string, args: { query_embedding: string }) => ({
            abortSignal: (signal: AbortSignal) => {
              h.rpcCalls += 1;
              return h.rpc!(args, signal);
            },
          }),
        }
      : null,
}));

import { semanticSearch, semanticSearchSegments } from '@/app/api/_lib/semantic';
import { getVideo } from '@/app/api/_lib/data';
import { resetRuntimeSearch } from '@/lib/autopilot/fusion';
import { clearRuntimeVideos } from '@/lib/autopilot/registry';

function match(over: Partial<KnowledgeMatchRow>): KnowledgeMatchRow {
  return {
    chunk_id: 'c1',
    source_id: 's1',
    kind: 'youtube',
    external_id: 'RRRRRRRRRRR',
    chunk_index: 0,
    start_s: 12.5,
    end_s: 140,
    text: 'חיפוי אבן פראית: מחיר למטר והתקנה',
    similarity: 0.95,
    title: 'חיפוי אבן פראית: כמה זה עולה?',
    thumbnail_url: null,
    duration_s: 308,
    published_at: '2026-10-11T18:30:05+00:00',
    category_slug: 'finishes-design',
    summary_text: 'סיכום הסרטון',
    ...over,
  };
}

const RUNTIME_ROWS = [
  match({}),
  // A static id: the static index wins, this duplicate must be dropped.
  match({ chunk_id: 'c2', external_id: 'AAAAAAAAAAA', similarity: 0.99, text: 'כפול של סרטון סטטי' }),
  // Podcast episodes have no /video/<id>/ page: not fused.
  match({ chunk_id: 'c3', kind: 'podcast', external_id: 'episode-114', similarity: 0.97 }),
];

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.AUTOPILOT_SEARCH_TIMEOUT_MS;
  delete process.env.AUTOPILOT_SEARCH;
  h.rpc = null;
  h.rpcCalls = 0;
  resetRuntimeSearch();
  clearRuntimeVideos();
  // Query embedding (normalised by semantic.ts): close to the runtime chunk and video A.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [0.8, 0, 0, 0.6] }] }), { status: 200 })),
  );
});

async function staticOnly(query: string) {
  h.rpc = async () => ({ data: [], error: null });
  const res = await semanticSearch(query, 10);
  h.rpc = null;
  h.rpcCalls = 0;
  resetRuntimeSearch();
  return res;
}

describe('semanticSearch fuses the runtime knowledge store', () => {
  it('ranks a runtime chunk in the same RRF and returns the static result shape', async () => {
    h.rpc = async () => ({ data: RUNTIME_ROWS, error: null });
    const hits = await semanticSearch('כמה עולה חיפוי אבן', 10);

    expect(hits[0]).toEqual({
      kind: 'video',
      youtube_id: 'RRRRRRRRRRR',
      segment_index: 0,
      start_time: 12.5,
      end_time: 140,
      text: 'חיפוי אבן פראית: מחיר למטר והתקנה',
      cos: 0.95,
      score: expect.any(Number),
    });
    // Cosine + keyword ranks both count: above every static row.
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits.filter((x) => x.kind === 'video' && x.youtube_id === 'AAAAAAAAAAA')).toHaveLength(1);
    expect(hits.some((x) => x.kind === 'video' && x.youtube_id === 'episode-114')).toBe(false);
    expect(hits.some((x) => x.kind === 'post')).toBe(true);
  });

  it('sends the normalised query vector, and the routes can resolve the new video', async () => {
    let sent = '';
    h.rpc = async (args) => {
      sent = args.query_embedding;
      return { data: RUNTIME_ROWS, error: null };
    };
    const hits = await semanticSearchSegments('חיפוי אבן', 5);
    expect(hits.every((x) => x.kind === 'video')).toBe(true);
    expect(JSON.parse(sent)).toHaveLength(4);
    expect(JSON.parse(sent)[0]).toBeCloseTo(0.8, 5);
    // /api/search and /api/answer/stream look titles up with getVideo().
    expect(getVideo('RRRRRRRRRRR')).toMatchObject({
      youtube_id: 'RRRRRRRRRRR',
      title: 'חיפוי אבן פראית: כמה זה עולה?',
      summary: 'סיכום הסרטון',
      duration_seconds: 308,
      category_slug: 'finishes-design',
    });
  });

  it('fails open when the store errors: same results as static only', async () => {
    const baseline = await staticOnly('יסודות ובטון');
    h.rpc = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:54321');
    };
    expect(await semanticSearch('יסודות ובטון', 10)).toEqual(baseline);
    expect(h.rpcCalls).toBe(1);
  });

  it('fails open on a PostgREST error (e.g. migration not applied)', async () => {
    const baseline = await staticOnly('יסודות ובטון');
    h.rpc = async () => ({ data: null, error: { message: 'Could not find the function public.match_knowledge_chunks' } });
    expect(await semanticSearch('יסודות ובטון', 10)).toEqual(baseline);
  });

  it('caps a hanging store at the timeout and then skips it for a while', async () => {
    process.env.AUTOPILOT_SEARCH_TIMEOUT_MS = '60';
    const baseline = await staticOnly('ריצוף');
    let aborted = false;
    h.rpc = (_args, signal) =>
      new Promise(() => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
      });
    const t0 = Date.now();
    expect(await semanticSearch('ריצוף', 10)).toEqual(baseline);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(aborted).toBe(true);
    // Circuit open: the next query does not wait on the store again.
    await semanticSearch('ריצוף', 10);
    expect(h.rpcCalls).toBe(1);
  });

  it('does not query the store when it is not configured, disabled, or only posts are wanted', async () => {
    const plain = await semanticSearch('בטון', 10); // h.rpc null: serviceDb() -> null
    expect(plain.length).toBeGreaterThan(0);

    h.rpc = async () => ({ data: RUNTIME_ROWS, error: null });
    await semanticSearch('בטון', 10, ['post']);
    expect(h.rpcCalls).toBe(0);

    process.env.AUTOPILOT_SEARCH = 'off';
    await semanticSearch('בטון', 10);
    expect(h.rpcCalls).toBe(0);
  });
});
