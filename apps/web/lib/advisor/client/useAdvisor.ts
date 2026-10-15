'use client';

/**
 * The advisor conversation in the browser: turns, the answer stream, follow-up
 * history (last 4 turns, with each turn's standalone query), local persistence
 * and the project-file write (bb.advisor.recent).
 *
 *   const advisor = useAdvisor();
 *   advisor.ask('כמה עולה שלד?', { origin: 'typed' });
 *
 * Text chunks are appended once per animation frame, so a fast stream never
 * re-renders more than the screen can show.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdvisorConfidence,
  AdvisorDegraded,
  AdvisorFocus,
  AdvisorHistoryTurn,
  AdvisorIntent,
  AdvisorOrigin,
  AdvisorPros,
  AdvisorRefusal,
  AdvisorSource,
  AdvisorStats,
} from '../types';
import { streamAdvisor } from './sse';
import { draftRegion, pushRecentQuestion, saveThread, sharePayloadOf, type StoredThread, type StoredTurn } from './storage';

export type TurnStatus = 'searching' | 'answering' | 'done' | 'error';

export interface AdvisorTurn {
  id: string;
  question: string;
  origin: AdvisorOrigin;
  focus?: AdvisorFocus;
  status: TurnStatus;
  sources: AdvisorSource[];
  stats: AdvisorStats | null;
  confidence: AdvisorConfidence | null;
  /** Standalone query retrieval ran on. */
  sq: string | null;
  rewritten: boolean;
  answer: string;
  followups: string[];
  pros: AdvisorPros | null;
  intent: AdvisorIntent | null;
  degraded?: AdvisorDegraded;
  refused?: AdvisorRefusal;
  /** Server signature: the turn can be shared. */
  signature?: string;
  /** ISO time of the answer. */
  at: string;
  shareId?: string;
  feedback?: 'up' | 'down';
  error?: string;
  /** Restored from storage or a share (no live stream). */
  restored?: boolean;
}

export interface AskOptions {
  origin?: AdvisorOrigin;
  focus?: AdvisorFocus;
}

export const MAX_HISTORY = 4;

const ERROR_MESSAGE = 'לא הצלחנו לקבל תשובה כרגע. נסו שוב בעוד רגע.';
const CUT_MESSAGE = 'התשובה נקטעה באמצע. נסו לשאול שוב.';

export function newThreadId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // fall through
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let localSeq = 0;
function localId(): string {
  localSeq += 1;
  return `t${Date.now().toString(36)}${localSeq}`;
}

/** Turns that can be follow-up context: real, finished answers. */
export function historyFrom(turns: readonly AdvisorTurn[], max = MAX_HISTORY): AdvisorHistoryTurn[] {
  return turns
    .filter((t) => t.status === 'done' && t.answer && !t.refused && !t.degraded)
    .slice(-max)
    .map((t) => ({ q: t.question, a: t.answer.slice(0, 900), ...(t.sq ? { sq: t.sq } : {}) }));
}

export function storedToTurn(s: StoredTurn): AdvisorTurn {
  return {
    id: localId(),
    question: s.question,
    origin: 'typed',
    status: 'done',
    sources: s.sources,
    stats: null,
    confidence: typeof s.confidence === 'number' ? { score: s.confidence, level: s.confidence >= 0.62 ? 'high' : s.confidence >= 0.38 ? 'medium' : 'low', topSimilarity: 0 } : null,
    sq: s.sq ?? null,
    rewritten: false,
    answer: s.answer,
    followups: s.followups,
    pros: null,
    intent: null,
    degraded: s.degraded,
    refused: s.refused,
    signature: s.signature,
    at: s.at,
    shareId: s.shareId,
    restored: true,
  };
}

export function turnToStored(t: AdvisorTurn): StoredTurn {
  return {
    question: t.question,
    answer: t.answer,
    sources: t.sources,
    followups: t.followups,
    at: t.at,
    ...(t.sq ? { sq: t.sq } : {}),
    ...(t.confidence ? { confidence: t.confidence.score } : {}),
    ...(t.degraded ? { degraded: t.degraded } : {}),
    ...(t.refused ? { refused: t.refused } : {}),
    ...(t.signature ? { signature: t.signature } : {}),
    ...(t.shareId ? { shareId: t.shareId } : {}),
  };
}

export interface UseAdvisorOptions {
  initialThread?: StoredThread | null;
  /** Keep conversations in localStorage (default true). */
  persist?: boolean;
  endpoint?: string;
}

export function useAdvisor({ initialThread = null, persist = true, endpoint }: UseAdvisorOptions = {}) {
  const [threadId, setThreadId] = useState<string>(() => initialThread?.id ?? newThreadId());
  const [turns, setTurns] = useState<AdvisorTurn[]>(() => (initialThread ? initialThread.turns.map(storedToTurn) : []));
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const threadRef = useRef(threadId);
  threadRef.current = threadId;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = turns.some((t) => t.status === 'searching' || t.status === 'answering');

  const update = useCallback((id: string, fn: (t: AdvisorTurn) => AdvisorTurn) => {
    setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const persistNow = useCallback(() => {
    if (!persist) return;
    const done = turnsRef.current.filter((t) => t.status === 'done' && t.answer);
    if (done.length === 0) return;
    saveThread({ id: threadRef.current, title: done[0].question, updatedAt: new Date().toISOString(), turns: done.map(turnToStored) });
  }, [persist]);

  // Persist after every change once the latest turn settles.
  useEffect(() => {
    const last = turns[turns.length - 1];
    if (last && (last.status === 'done' || last.status === 'error')) persistNow();
  }, [turns, persistNow]);

  const ask = useCallback(
    async (question: string, { origin = 'typed', focus }: AskOptions = {}) => {
      const q = question.replace(/\s+/g, ' ').trim();
      if (!q) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const prior = turnsRef.current;
      const id = localId();
      const turnNumber = prior.length + 1;
      const fresh: AdvisorTurn = {
        id,
        question: q,
        origin,
        focus,
        status: 'searching',
        sources: [],
        stats: null,
        confidence: null,
        sq: null,
        rewritten: false,
        answer: '',
        followups: [],
        pros: null,
        intent: null,
        at: new Date().toISOString(),
      };
      setTurns((ts) => [...ts, fresh]);
      pushRecentQuestion(q, fresh.at);

      let pending = '';
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (!pending) return;
        const text = pending;
        pending = '';
        update(id, (t) => ({ ...t, answer: t.answer + text, status: t.status === 'done' ? t.status : 'answering' }));
      };
      const schedule = () => {
        if (frame) return;
        frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(flush) : (setTimeout(flush, 16) as unknown as number);
      };

      try {
        await streamAdvisor(
          {
            query: q,
            history: historyFrom(prior),
            conversation_id: threadRef.current,
            turn: turnNumber,
            origin,
            ...(focus ? { focus } : {}),
            ...(draftRegion() ? { region: draftRegion() } : {}),
          },
          {
            signal: controller.signal,
            endpoint,
            onEvent: (evt) => {
              switch (evt.type) {
                case 'sources':
                  update(id, (t) => ({
                    ...t,
                    status: 'answering',
                    sources: evt.sources,
                    stats: evt.stats,
                    confidence: evt.confidence,
                    sq: evt.query,
                    rewritten: evt.rewritten,
                  }));
                  break;
                case 'chunk':
                  pending += evt.content;
                  schedule();
                  break;
                case 'reset':
                  pending = '';
                  update(id, (t) => ({ ...t, answer: '' }));
                  break;
                case 'done':
                  flush();
                  update(id, (t) => ({
                    ...t,
                    status: 'done',
                    sources: evt.sources,
                    followups: evt.followups,
                    pros: evt.pros,
                    intent: evt.intent,
                    confidence: evt.confidence_detail ?? t.confidence,
                    degraded: evt.degraded,
                    refused: evt.refused,
                    // The signed payload is the canonical answer (sharing verifies it as-is).
                    ...(evt.share
                      ? { answer: evt.share.payload.answer, signature: evt.share.signature, at: evt.share.payload.at, followups: evt.share.payload.followups, sources: evt.share.payload.sources }
                      : {}),
                  }));
                  break;
                case 'error':
                  flush();
                  update(id, (t) => ({ ...t, status: 'error', error: CUT_MESSAGE }));
                  break;
                default:
                  break;
              }
            },
          },
        );
        flush();
        update(id, (t) => (t.status === 'done' || t.status === 'error' ? t : { ...t, status: t.answer ? 'done' : 'error', error: t.answer ? undefined : CUT_MESSAGE }));
      } catch {
        flush();
        if (controller.signal.aborted) {
          update(id, (t) => (t.status === 'done' ? t : { ...t, status: t.answer ? 'done' : 'error', error: t.answer ? undefined : 'השאלה בוטלה.' }));
        } else {
          update(id, (t) => ({ ...t, status: 'error', error: ERROR_MESSAGE }));
        }
      } finally {
        if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [endpoint, update],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newThread = useCallback(() => {
    abortRef.current?.abort();
    setThreadId(newThreadId());
    setTurns([]);
  }, []);

  const openThread = useCallback((thread: StoredThread) => {
    abortRef.current?.abort();
    setThreadId(thread.id);
    setTurns(thread.turns.map(storedToTurn));
  }, []);

  const patchTurn = useCallback(
    (id: string, patch: Partial<Pick<AdvisorTurn, 'feedback' | 'shareId'>>) => {
      update(id, (t) => ({ ...t, ...patch }));
    },
    [update],
  );

  /** The exact payload the server signed, for sharing. */
  const sharePayload = useCallback((t: AdvisorTurn) => sharePayloadOf(turnToStored(t)), []);

  return { threadId, turns, busy, ask, stop, newThread, openThread, patchTurn, sharePayload };
}

export type AdvisorController = ReturnType<typeof useAdvisor>;
