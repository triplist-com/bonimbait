/**
 * The advisor demo (/platform/demo/advisor/): one real answer to the headline
 * question, recorded once from the live pipeline by
 * scripts/advisor/record_demo_fixture.mjs (advisor-recording.json): real
 * YouTube ids, exact seconds, quotes, the streamed chunks and their timing.
 * The demo replays it with a typing effect, so it costs $0 to show.
 *
 * Replay timing is normalised to the warm production pipeline: sources about
 * 450 ms after the question (measured 360-470 ms warm), the first word about
 * 0.9 s later (Sonnet 5.5's measured time to first token), then the chunks at
 * their recorded pace.
 */
import type { AdvisorConfidence, AdvisorIntent, AdvisorPros, AdvisorSource, AdvisorStats } from '@/lib/advisor/types';
import recording from './advisor-recording.json';
import { defineDemoFixture } from './define';

export interface AdvisorRecording {
  question: string;
  recordedAt: string;
  model: string;
  timings: { sourcesMs: number; firstChunkMs: number; totalMs: number };
  stats: AdvisorStats;
  confidence: AdvisorConfidence;
  sources: AdvisorSource[];
  answer: string;
  /** Text deltas; `t` is ms after the first one. */
  chunks: Array<{ t: number; text: string }>;
  followups: string[];
  pros: AdvisorPros | null;
  intent: AdvisorIntent;
}

export interface AdvisorDemoData extends AdvisorRecording {
  /** Replay schedule (ms from the question). */
  replay: { sourcesAt: number; firstChunkAt: number };
}

export const ADVISOR_REPLAY = { sourcesAt: 450, firstChunkAt: 1350 } as const;

export const advisorDemo = defineDemoFixture('advisor', (): AdvisorDemoData => ({
  ...(recording as AdvisorRecording),
  replay: { ...ADVISOR_REPLAY },
}));
