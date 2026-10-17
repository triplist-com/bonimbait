/**
 * The AI advisor ("שאלו את בונים בית"): shared types for the server pipeline,
 * the SSE protocol of POST /api/answer/stream and the client UI. Client-safe.
 *
 * Protocol (one `data: <json>\n\n` line per event):
 *   1. { type: 'sources', ... }   right after retrieval, before the model call
 *   2. { type: 'chunk', content }  answer text deltas (the follow-up trailer is held back)
 *   3. { type: 'done', ... }       final sources, follow-ups, confidence, lead context
 *   ({ type: 'reset' } before a replacement chunk: the model declined mid-answer)
 *   or { type: 'error', message }  the stream broke
 * Older clients that only read `chunk` and `done` keep working.
 */
import type { ProjectStageId } from '@/lib/project-file/types';
import type { PartnerOffer } from '@/lib/revenue/types';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface AdvisorConfidence {
  /** 0..1, from retrieval similarity (lib/advisor/confidence.ts). */
  score: number;
  level: ConfidenceLevel;
  /** Best cosine similarity among the sources (raw, for analytics). */
  topSimilarity: number;
}

/** One moment inside a video: the second to play from and the words said there. */
export interface AdvisorMoment {
  second: number;
  quote: string;
}

export interface AdvisorVideoSource {
  kind: 'video';
  /** 1-based citation number: the model cites it as [n]. */
  n: number;
  video_id: string;
  youtube_id: string;
  title: string;
  /** The exact second to play from (= moments[0].second). Legacy field name. */
  timestamp: number;
  /** Best moment first; at most 3. */
  moments: AdvisorMoment[];
  thumbnail_url: string;
  /** ISO date the video was published, when known. */
  published_at: string | null;
  duration_seconds: number | null;
  /** Podcast episode number from the title ("פרק 109"), when there is one. */
  episode: string | null;
  relevance_score: number;
  /** Cited by the finished answer (set on `done`). */
  cited?: boolean;
}

export interface AdvisorPostSource {
  kind: 'post';
  n: number;
  slug: string;
  title: string;
  url: string;
  /** The passage that matched the question. */
  excerpt: string;
  published_at: string | null;
  image: string | null;
  relevance_score: number;
  cited?: boolean;
}

export type AdvisorSource = AdvisorVideoSource | AdvisorPostSource;

export interface AdvisorStats {
  /** Passages (video moments and article sections) the answer is built on. */
  moments: number;
  videos: number;
  articles: number;
}

/** A matched pro under the answer (app/api/_lib/pros.ts, ordered by rankPros()). */
export interface AdvisorPro {
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  logo_url: string | null;
  href: string;
  /** The pro's partner tier, when it has one (it lifted the pro within relevance). */
  badge?: { tierSlug: string; tierName: string; badgeLabel: string; rank: number } | null;
}

export interface AdvisorPros {
  specialty: { slug: string; name: string; href: string };
  pros: AdvisorPro[];
  /** Region the list was narrowed to, when the visitor's region is known. */
  region?: { slug: string; name: string } | null;
}

/** Why an answer was not produced by the model. */
export type AdvisorDegraded = 'rate_limited' | 'budget' | 'disabled' | 'refusal' | 'error';

/** Why the advisor declined to answer from the library. */
export type AdvisorRefusal = 'out_of_scope' | 'low_confidence';

/** What the visitor's question is about, for lead moments (lib/advisor/lead.ts). */
export interface AdvisorIntent {
  cost: boolean;
}

/** A finished answer, signed by the server so it can be shared as-is (lib/advisor/share.ts). */
export interface AdvisorSharePayload {
  v: 1;
  question: string;
  answer: string;
  sources: AdvisorSource[];
  followups: string[];
  /** ISO time the answer was produced. */
  at: string;
}

export type AdvisorEvent =
  | {
      type: 'sources';
      sources: AdvisorSource[];
      stats: AdvisorStats;
      confidence: AdvisorConfidence;
      /** The standalone query retrieval ran on (rewritten for follow-ups). */
      query: string;
      rewritten: boolean;
    }
  | { type: 'chunk'; content: string }
  | {
      type: 'done';
      sources: AdvisorSource[];
      followups: string[];
      /** Legacy 0..1 number (older clients); see `confidence_detail`. */
      confidence: number;
      confidence_detail: AdvisorConfidence;
      pros: AdvisorPros | null;
      intent: AdvisorIntent;
      /**
       * At most one sponsored partner offer that fits the topic, stage and
       * region (lib/revenue/offers-server.ts getContextualOffers). Real answers
       * only; it sits next to the pros, never instead of them.
       */
      offer?: PartnerOffer | null;
      degraded?: AdvisorDegraded;
      refused?: AdvisorRefusal;
      /** Present on real answers: lets the visitor share this exact answer. */
      share?: { payload: AdvisorSharePayload; signature: string };
    }
  /** Discard the answer text streamed so far (the model declined mid-answer). */
  | { type: 'reset' }
  /** Development dry runs only: the prompt the model would get. */
  | { type: 'debug'; system: string; system_chars: number; user_turn: string; user_chars: number }
  | { type: 'error'; message: string };

/** A previous turn sent with a follow-up (the server keeps no conversation state). */
export interface AdvisorHistoryTurn {
  q: string;
  a: string;
  /** The standalone query retrieval ran on for that turn (from its `sources` event). */
  sq?: string;
}

/** Where a question came from (analytics, and whether to rewrite it). */
export type AdvisorOrigin = 'typed' | 'followup' | 'chip' | 'url' | 'search' | 'video' | 'post' | 'demo';

/** "Ask about this video / article": retrieval prefers this document. */
export type AdvisorFocus = { kind: 'video'; id: string } | { kind: 'post'; id: string };

export interface AdvisorRequest {
  query: string;
  history?: AdvisorHistoryTurn[];
  conversation_id?: string;
  /** 1-based turn in the conversation. */
  turn?: number;
  origin?: AdvisorOrigin;
  focus?: AdvisorFocus;
  /** regions.slug from the visitor's project file, for region-aware pros. */
  region?: string;
  /** The visitor's build stage (lib/stages.ts id) from their project file, for the partner offer. */
  stage?: ProjectStageId;
  /** Development only (ignored in production): stop before the model call and return the prompt. */
  dryRun?: boolean;
}
