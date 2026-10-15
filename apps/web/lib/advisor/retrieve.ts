import 'server-only';

/**
 * Retrieval for the advisor: hybrid search (app/api/_lib/semantic.ts, static
 * index + Content Autopilot store), grouped into documents, turned into
 * numbered source cards and the passages the model reads.
 *
 * - One number per document (a video or an article), so a citation [n] maps
 *   straight to a card. A video brings up to two passages, each with its own
 *   exact second (lib/advisor/moments.ts, on the knowledge squad's marks).
 * - Title-only rows (videos without captions) are search-only: never sources.
 * - "Ask about this video / article" puts that document first.
 * - Passages share one character budget, so a prompt stays ~4-5K tokens.
 */
import { getVideo, type VideoRecord } from '@/app/api/_lib/data';
import { semanticSearch, type PostHit, type SearchHit, type SegmentHit } from '@/app/api/_lib/semantic';
import { episodeNumber } from '@/lib/format';
import { focusWindow, queryTerms, wantsNumbers, type Mark } from '@/lib/knowledge/moments';
import { isTitleOnly } from '@/lib/knowledge/segment-text';
import { CONFIDENCE, computeConfidence, type ConfidenceResult } from './confidence';
import {
  CONTEXT_CHAR_BUDGET,
  MAX_PASSAGES_PER_POST,
  MAX_PASSAGES_PER_VIDEO,
  MAX_POST_SOURCES,
  MAX_SOURCES,
  POST_PASSAGE_CHARS,
  SEARCH_TOP_K,
} from './config';
import { momentFinder, type ResolvedMoment } from './moments';
import type { PromptSource } from './prompt';
import type { AdvisorFocus, AdvisorMoment, AdvisorSource, AdvisorStats } from './types';

/** Index rows carry caption marks and a title-only flag that SegmentHit doesn't declare. */
type IndexedSegment = SegmentHit & { marks?: Mark[]; title_only?: boolean };

/** A source must be this close (cosine) to the best one to be shown. */
const RELEVANCE_SPREAD = 0.18;
/** Two moments of one video closer than this are the same moment. */
const SAME_MOMENT_SECONDS = 30;
const POST_EXCERPT_CHARS = 220;

export interface Retrieval {
  sources: AdvisorSource[];
  prompt: PromptSource[];
  stats: AdvisorStats;
  confidence: ConfidenceResult;
  /** Title of the focused document, when it was found. */
  focusTitle: string | null;
}

type VideoDoc = { kind: 'video'; key: string; video: VideoRecord; hits: IndexedSegment[]; top: number; cos: number };
type PostDoc = { kind: 'post'; key: string; slug: string; title: string; hits: PostHit[]; top: number; cos: number };
type Doc = VideoDoc | PostDoc;

function docKey(h: SearchHit): string {
  return h.kind === 'video' ? `v:${h.youtube_id}` : `p:${h.slug}`;
}

function focusKey(focus: AdvisorFocus | undefined): string | null {
  if (!focus) return null;
  return focus.kind === 'video' ? `v:${focus.id}` : `p:${focus.id}`;
}

/** Group hits into documents that can ground an answer, best first. */
export function groupDocuments(hits: SearchHit[], lookupVideo: (id: string) => VideoRecord | null = getVideo): Doc[] {
  const byKey = new Map<string, Doc>();
  for (const h of hits) {
    if (h.kind === 'video' && isTitleOnly(h)) continue;
    const key = docKey(h);
    const doc = byKey.get(key);
    if (doc) {
      if (doc.kind === 'video' && h.kind === 'video') doc.hits.push(h as IndexedSegment);
      else if (doc.kind === 'post' && h.kind === 'post') doc.hits.push(h);
      doc.cos = Math.max(doc.cos, h.cos);
      continue;
    }
    if (h.kind === 'video') {
      const video = lookupVideo(h.youtube_id);
      if (!video) continue;
      byKey.set(key, { kind: 'video', key, video, hits: [h as IndexedSegment], top: h.score, cos: h.cos });
    } else {
      byKey.set(key, { kind: 'post', key, slug: h.slug, title: h.title, hits: [h], top: h.score, cos: h.cos });
    }
  }
  const docs = Array.from(byKey.values());
  for (const d of docs) {
    d.hits.sort((a, b) => b.score - a.score);
    d.top = d.hits[0].score;
  }
  return docs.sort((a, b) => b.top - a.top);
}

/**
 * Pick the documents to show: at most MAX_SOURCES, a cap on articles, none far
 * below the best. Display (and citation) order: the focused document, then the
 * video moments, then articles, each by relevance. The moments are what the
 * advisor plays, so they lead. For a cost question (`newestFirst`) the chosen
 * videos go newest first: prices move, so the latest figure should lead.
 */
export function selectDocuments(docs: Doc[], focus?: AdvisorFocus, { newestFirst = false }: { newestFirst?: boolean } = {}): Doc[] {
  const fk = focusKey(focus);
  const focused = fk ? docs.find((d) => d.key === fk) : undefined;
  const ordered = focused ? [focused, ...docs.filter((d) => d !== focused)] : docs;
  const picked: Doc[] = [];
  let posts = 0;
  for (const d of ordered) {
    if (picked.length >= MAX_SOURCES) break;
    if (d.kind === 'post' && d !== focused) {
      if (posts >= MAX_POST_SOURCES) continue;
      posts += 1;
    }
    picked.push(d);
  }
  const best = Math.max(...picked.map((d) => d.cos), 0);
  const kept = picked.filter((d) => d === focused || d === picked[0] || (d.cos >= best - RELEVANCE_SPREAD && d.cos >= CONFIDENCE.refuseBelow));
  const rest = kept.filter((d) => d !== focused);
  const videos = rest.filter((d): d is VideoDoc => d.kind === 'video');
  if (newestFirst) videos.sort((a, b) => (b.video.published_at || '').localeCompare(a.video.published_at || '') || b.top - a.top);
  return [...(focused && kept.includes(focused) ? [focused] : []), ...videos, ...rest.filter((d) => d.kind === 'post')];
}

function postBody(hit: PostHit, title: string): string {
  const t = hit.text;
  return t.startsWith(title) ? t.slice(title.length).trim() : t;
}

function wordSlice(text: string, start: number, end: number): string {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  if (s > 0) {
    const sp = text.indexOf(' ', s);
    if (sp !== -1 && sp < e) s = sp + 1;
  }
  if (e < text.length) {
    const sp = text.lastIndexOf(' ', e);
    if (sp > s) e = sp;
  }
  return `${s > 0 ? '…' : ''}${text.slice(s, e).trim()}${e < text.length ? '…' : ''}`;
}

type Passage = { score: number; text: string; second: number | null; quote: string; order: number };

function videoPassages(doc: VideoDoc, resolve: (seg: IndexedSegment, title: string) => ResolvedMoment): Passage[] {
  const out: Passage[] = [];
  for (const seg of doc.hits.slice(0, MAX_PASSAGES_PER_VIDEO + 1)) {
    const m = resolve(seg, doc.video.title);
    if (out.some((p) => p.second !== null && Math.abs(p.second - m.second) < SAME_MOMENT_SECONDS)) continue;
    out.push({ score: seg.score, text: m.text, second: m.second, quote: m.quote, order: m.second });
    if (out.length >= MAX_PASSAGES_PER_VIDEO) break;
  }
  return out;
}

function postPassages(doc: PostDoc, terms: string[], numeric: boolean): Passage[] {
  return doc.hits.slice(0, MAX_PASSAGES_PER_POST).map((hit) => {
    const body = postBody(hit, doc.title);
    const { start, end, anchor } = focusWindow(body, terms, POST_PASSAGE_CHARS, numeric);
    return {
      score: hit.score,
      text: body.slice(start, end),
      second: null,
      quote: wordSlice(body, anchor - 40, anchor - 40 + POST_EXCERPT_CHARS),
      order: hit.chunk_index,
    };
  });
}

/** Share of the question's content terms that appear in the passages (0..1). */
function termCoverage(terms: string[], passages: Passage[]): number | undefined {
  if (terms.length === 0) return undefined;
  const text = passages.map((p) => p.text).join(' ').replace(/[ךםןףץ]/g, (c) => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' })[c] ?? c);
  const found = terms.filter((t) => text.includes(t) || (t.length > 3 && 'הובלמכש'.includes(t[0]) && text.includes(t.slice(1))));
  return found.length / terms.length;
}

/** Build cards and prompt passages from the chosen documents. Pure (given the documents). */
export function buildSources(query: string, docs: Doc[]): Omit<Retrieval, 'focusTitle'> {
  const terms = queryTerms(query);
  const numeric = wantsNumbers(query);
  const resolve = momentFinder(query);
  const perDoc = docs.map((d) => (d.kind === 'video' ? videoPassages(d, resolve) : postPassages(d, terms, numeric)));

  // One passage per document first, then second passages while the budget lasts.
  let budget = CONTEXT_CHAR_BUDGET;
  const kept: Passage[][] = perDoc.map(() => []);
  for (let round = 0; round < Math.max(MAX_PASSAGES_PER_VIDEO, MAX_PASSAGES_PER_POST); round++) {
    perDoc.forEach((passages, i) => {
      const p = passages[round];
      if (!p) return;
      if (round > 0 && p.text.length > budget) return;
      kept[i].push(p);
      budget -= p.text.length;
    });
  }

  const sources: AdvisorSource[] = [];
  const prompt: PromptSource[] = [];
  docs.forEach((d, i) => {
    const n = i + 1;
    const passages = kept[i];
    if (d.kind === 'video') {
      const v = d.video;
      const moments: AdvisorMoment[] = passages.map((p) => ({ second: p.second ?? 0, quote: p.quote }));
      sources.push({
        kind: 'video',
        n,
        video_id: v.id,
        youtube_id: v.youtube_id,
        title: v.title,
        timestamp: moments[0]?.second ?? 0,
        moments,
        thumbnail_url: v.thumbnail_url || `https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg`,
        published_at: v.published_at || null,
        duration_seconds: v.duration_seconds || null,
        episode: episodeNumber(v.title),
        relevance_score: round3(d.cos),
      });
      prompt.push({
        n,
        label: v.kind === 'podcast' || /פודקאסט/.test(v.title) ? 'podcast' : 'video',
        title: v.title,
        publishedAt: v.published_at || null,
        passages: passages
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((p) => ({ second: p.second, text: p.text })),
      });
    } else {
      sources.push({
        kind: 'post',
        n,
        slug: d.slug,
        title: d.title,
        url: `/${d.slug}/`,
        excerpt: passages[0]?.quote ?? '',
        published_at: null,
        image: null,
        relevance_score: round3(d.cos),
      });
      prompt.push({
        n,
        label: 'post',
        title: d.title,
        publishedAt: null,
        passages: passages
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((p) => ({ second: null, text: p.text })),
      });
    }
  });

  const all = kept.flat();
  return {
    sources,
    prompt,
    stats: {
      moments: all.length,
      videos: sources.filter((s) => s.kind === 'video').length,
      articles: sources.filter((s) => s.kind === 'post').length,
    },
    confidence: computeConfidence({ cosines: docs.map((d) => d.cos), termCoverage: termCoverage(terms, all) }),
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Run retrieval for a (standalone) question. Throws when search itself fails. */
export async function retrieve(query: string, opts: { focus?: AdvisorFocus } = {}): Promise<Retrieval> {
  // With a focus, rank everything so the focused document is always found.
  const hits = await semanticSearch(query, opts.focus ? 100_000 : SEARCH_TOP_K);
  const docs = selectDocuments(groupDocuments(hits), opts.focus, { newestFirst: wantsNumbers(query) });
  const fk = focusKey(opts.focus);
  const focused = fk ? docs.find((d) => d.key === fk) : undefined;
  const built = buildSources(query, docs);
  return {
    ...built,
    focusTitle: focused ? (focused.kind === 'video' ? focused.video.title : focused.title) : null,
  };
}
