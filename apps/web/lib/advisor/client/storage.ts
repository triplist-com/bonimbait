/**
 * Browser storage for the advisor (anonymous visitors; members' threads live
 * in the DB, lib/advisor/threads.ts):
 *
 *   bb.advisor.recent   { q, at }[]: the last 10 questions, oldest first. The
 *                       project-file contract (docs/platform/PROGRAM.md §6):
 *                       the revenue squad's collectProjectFile() reads it.
 *   bb.advisor.threads  recent conversations, newest first, capped.
 *
 * Every access is wrapped: private mode, a full quota or disabled storage
 * never breaks the page. Client-safe (no-ops on the server).
 */
import type { AdvisorDegraded, AdvisorRefusal, AdvisorSharePayload, AdvisorSource } from '../types';

export const RECENT_KEY = 'bb.advisor.recent';
export const THREADS_KEY = 'bb.advisor.threads';
export const MAX_RECENT = 10;
export const MAX_THREADS = 12;
export const MAX_TURNS = 12;

export interface RecentQuestion {
  q: string;
  at: string;
}

export interface StoredTurn {
  question: string;
  answer: string;
  sources: AdvisorSource[];
  followups: string[];
  /** ISO time of the answer (the share payload's `at`). */
  at: string;
  /** Standalone query retrieval ran on (sent back as history `sq`). */
  sq?: string;
  confidence?: number;
  degraded?: AdvisorDegraded;
  refused?: AdvisorRefusal;
  /** Server signature over { v, question, answer, sources, followups, at }: makes the turn shareable. */
  signature?: string;
  /** Snapshot id once shared. */
  shareId?: string;
}

export interface StoredThread {
  id: string;
  title: string;
  updatedAt: string;
  turns: StoredTurn[];
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// bb.advisor.recent (project file)
// ---------------------------------------------------------------------------

function isRecent(v: unknown): v is RecentQuestion {
  return Boolean(v) && typeof (v as RecentQuestion).q === 'string' && typeof (v as RecentQuestion).at === 'string';
}

export function readRecentQuestions(): RecentQuestion[] {
  const raw = readJson<unknown>(RECENT_KEY);
  return Array.isArray(raw) ? raw.filter(isRecent).slice(-MAX_RECENT) : [];
}

/** Append a question (a repeat moves to the end); keeps the last 10. */
export function pushRecentQuestion(q: string, at: string = new Date().toISOString()): RecentQuestion[] {
  const question = q.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!question) return readRecentQuestions();
  const next = readRecentQuestions()
    .filter((r) => r.q !== question)
    .concat({ q: question, at })
    .slice(-MAX_RECENT);
  writeJson(RECENT_KEY, next);
  return next;
}

// ---------------------------------------------------------------------------
// bb.advisor.threads
// ---------------------------------------------------------------------------

function isThread(v: unknown): v is StoredThread {
  const t = v as StoredThread;
  return Boolean(t) && typeof t.id === 'string' && typeof t.title === 'string' && Array.isArray(t.turns);
}

export function listThreads(): StoredThread[] {
  const raw = readJson<unknown>(THREADS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isThread).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function loadThread(id: string): StoredThread | null {
  return listThreads().find((t) => t.id === id) ?? null;
}

/** Insert or replace a thread; keeps the newest MAX_THREADS and the last MAX_TURNS turns. */
export function saveThread(thread: StoredThread): void {
  const clean: StoredThread = { ...thread, title: thread.title.slice(0, 160), turns: thread.turns.slice(-MAX_TURNS) };
  let threads = [clean, ...listThreads().filter((t) => t.id !== thread.id)].slice(0, MAX_THREADS);
  // A full quota: drop the oldest conversations until it fits (or give up quietly).
  while (!writeJson(THREADS_KEY, threads) && threads.length > 1) threads = threads.slice(0, -1);
}

export function deleteThread(id: string): void {
  writeJson(
    THREADS_KEY,
    listThreads().filter((t) => t.id !== id),
  );
}

/** The exact payload the server signed for a stored turn. */
export function sharePayloadOf(turn: StoredTurn): AdvisorSharePayload {
  return { v: 1, question: turn.question, answer: turn.answer, sources: turn.sources, followups: turn.followups, at: turn.at };
}

/** The visitor's region from the hub draft (bb.hub.draft, PROGRAM.md §6), for region-aware pros. */
export function draftRegion(): string | undefined {
  const draft = readJson<{ regionSlug?: unknown }>('bb.hub.draft');
  return typeof draft?.regionSlug === 'string' && /^[a-z0-9-]{2,40}$/.test(draft.regionSlug) ? draft.regionSlug : undefined;
}
