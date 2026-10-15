import { NextResponse, type NextRequest } from 'next/server';
import { listMemberThreads, memberFromRequest } from '@/lib/advisor/threads';

/** GET /api/advisor/threads: the signed-in member's recent advisor conversations (RLS: own only). */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const member = await memberFromRequest(request);
  if (!member) return NextResponse.json({ threads: [] }, { status: 401, headers: PRIVATE });
  try {
    const threads = await listMemberThreads(member);
    return NextResponse.json({ threads }, { headers: PRIVATE });
  } catch (err) {
    console.error('[advisor] thread list failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ threads: [] }, { status: 500, headers: PRIVATE });
  }
}
