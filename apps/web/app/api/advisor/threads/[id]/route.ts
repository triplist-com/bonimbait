import { NextResponse, type NextRequest } from 'next/server';
import { signShare } from '@/lib/advisor/share';
import { deleteMemberThread, loadMemberThread, memberFromRequest, messagesToTurns } from '@/lib/advisor/threads';
import type { StoredThread, StoredTurn } from '@/lib/advisor/client/storage';

/**
 * GET    /api/advisor/threads/<id>: one of the member's conversations, in the
 *        browser's StoredThread shape. Answers are signed again so a reopened
 *        answer can be shared (only the server writes answers, see lib/advisor/threads.ts).
 * DELETE /api/advisor/threads/<id>: remove it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const member = await memberFromRequest(request);
  if (!member) return NextResponse.json({ error: 'sign in' }, { status: 401, headers: PRIVATE });
  try {
    const found = await loadMemberThread(member, params.id);
    if (!found) return NextResponse.json({ error: 'not found' }, { status: 404, headers: PRIVATE });
    const turns: StoredTurn[] = messagesToTurns(found.messages).map((t) => {
      const signature = signShare({ v: 1, question: t.question, answer: t.answer, sources: t.sources, followups: t.followups, at: t.at });
      return { ...t, ...(signature ? { signature } : {}) };
    });
    const thread: StoredThread = { id: found.thread.id, title: found.thread.title, updatedAt: found.thread.updated_at, turns };
    return NextResponse.json({ thread }, { headers: PRIVATE });
  } catch (err) {
    console.error('[advisor] thread load failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: PRIVATE });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const member = await memberFromRequest(request);
  if (!member) return NextResponse.json({ error: 'sign in' }, { status: 401, headers: PRIVATE });
  try {
    await deleteMemberThread(member, params.id);
    return new NextResponse(null, { status: 204, headers: PRIVATE });
  } catch (err) {
    console.error('[advisor] thread delete failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: PRIVATE });
  }
}
