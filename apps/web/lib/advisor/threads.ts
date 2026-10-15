import 'server-only';

/**
 * Member conversation threads (advisor_threads / advisor_messages). Every
 * query runs as the signed-in member (anon key + session cookie), so RLS
 * keeps them owner-only. Anonymous visitors never reach the DB: their threads
 * live in localStorage (lib/advisor/client/storage.ts), and without an auth
 * cookie there is not even an auth round trip.
 *
 * The answer route saves each finished turn itself (the server knows the
 * answer it produced); the page lists and reopens threads through
 * /api/advisor/threads. Nothing here throws into the answer stream.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { hasAuthCookie } from '@/lib/auth/cookie';
import { withTimeout } from '@/lib/platform/db';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import type { AdvisorDatabase, AdvisorMessageRow, AdvisorThreadRow } from './db-types';
import type { AdvisorSource } from './types';

export type AdvisorDb = SupabaseClient<AdvisorDatabase>;
export type Member = { db: AdvisorDb; user: User };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_TIMEOUT_MS = 2000;

export function isThreadId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

/** The signed-in member behind a request, or null. */
export async function memberFromRequest(request: { headers: { get(name: string): string | null } }): Promise<Member | null> {
  if (!isSupabaseConfigured() || !hasAuthCookie(request.headers.get('cookie'))) return null;
  try {
    const db = createClient() as unknown as AdvisorDb;
    const { data, error } = await withTimeout(db.auth.getUser(), DB_TIMEOUT_MS, 'advisor member');
    if (error || !data.user) return null;
    return { db, user: data.user };
  } catch {
    return null;
  }
}

export interface SavedTurn {
  conversationId: string;
  turn: number;
  question: string;
  answer: string;
  sources: AdvisorSource[];
  followups: string[];
  confidence: number;
  isDemo?: boolean;
}

/** Save one finished turn (question + answer) to the member's thread. Returns false on any failure. */
export async function saveMemberTurn(member: Member, t: SavedTurn): Promise<boolean> {
  if (!isThreadId(t.conversationId) || !t.question.trim() || !t.answer.trim()) return false;
  try {
    const { db, user } = member;
    const thread = await withTimeout(
      db
        .from('advisor_threads')
        .upsert({ id: t.conversationId, user_id: user.id, title: t.question.trim().slice(0, 300), is_demo: Boolean(t.isDemo) }, { onConflict: 'id', ignoreDuplicates: true }),
      DB_TIMEOUT_MS,
      'advisor thread',
    );
    if (thread.error) throw new Error(thread.error.message);
    const turn = Math.max(1, Math.min(1000, Math.floor(t.turn) || 1));
    const messages = await withTimeout(
      db.from('advisor_messages').insert([
        { thread_id: t.conversationId, user_id: user.id, turn, role: 'user', content: t.question.trim().slice(0, 2000) },
        {
          thread_id: t.conversationId,
          user_id: user.id,
          turn,
          role: 'assistant',
          content: t.answer.slice(0, 20000),
          sources: t.sources as unknown as AdvisorMessageRow['sources'],
          followups: t.followups,
          confidence: Math.min(1, Math.max(0, Math.round(t.confidence * 1000) / 1000)),
        },
      ]),
      DB_TIMEOUT_MS,
      'advisor messages',
    );
    if (messages.error) throw new Error(messages.error.message);
    return true;
  } catch (err) {
    console.warn(`[advisor] could not save the member's turn: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export type ThreadSummary = Pick<AdvisorThreadRow, 'id' | 'title' | 'turn_count' | 'updated_at'>;

export async function listMemberThreads(member: Member, limit = 20): Promise<ThreadSummary[]> {
  const { data, error } = await withTimeout(
    member.db.from('advisor_threads').select('id, title, turn_count, updated_at').order('updated_at', { ascending: false }).limit(limit),
    DB_TIMEOUT_MS,
    'advisor threads',
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as ThreadSummary[];
}

export type ThreadMessage = Pick<AdvisorMessageRow, 'turn' | 'role' | 'content' | 'sources' | 'followups' | 'confidence' | 'created_at'>;

export async function loadMemberThread(member: Member, id: string): Promise<{ thread: ThreadSummary; messages: ThreadMessage[] } | null> {
  if (!isThreadId(id)) return null;
  const [thread, messages] = await Promise.all([
    withTimeout(member.db.from('advisor_threads').select('id, title, turn_count, updated_at').eq('id', id).maybeSingle(), DB_TIMEOUT_MS, 'advisor thread'),
    withTimeout(
      member.db
        .from('advisor_messages')
        .select('turn, role, content, sources, followups, confidence, created_at')
        .eq('thread_id', id)
        .order('turn')
        .order('created_at'),
      DB_TIMEOUT_MS,
      'advisor messages',
    ),
  ]);
  if (thread.error) throw new Error(thread.error.message);
  if (messages.error) throw new Error(messages.error.message);
  if (!thread.data) return null;
  return { thread: thread.data as ThreadSummary, messages: (messages.data ?? []) as ThreadMessage[] };
}

export async function deleteMemberThread(member: Member, id: string): Promise<boolean> {
  if (!isThreadId(id)) return false;
  const { error } = await withTimeout(member.db.from('advisor_threads').delete().eq('id', id), DB_TIMEOUT_MS, 'advisor thread delete');
  if (error) throw new Error(error.message);
  return true;
}
