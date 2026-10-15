import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SHARE_ID_RE, stableStringify, verifyShare } from '@/lib/advisor/share';
import type { AdvisorDb } from '@/lib/advisor/threads';
import type { AdvisorSharePayload } from '@/lib/advisor/types';
import { rateLimit } from '@/lib/guard/rateLimit';
import { clientIpFromHeaders, hashIp } from '@/lib/leads/spam';
import { isDemoRequest } from '@/lib/platform/paths';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';

/**
 * POST /api/advisor/share { id, payload, signature }: store a shared answer
 * as a read-only snapshot at /ask/a/<id>/. Only answers the advisor really
 * gave are accepted (HMAC from the answer stream, lib/advisor/share.ts). The
 * same id with the same answer is idempotent; a different answer is a 409.
 */
export const runtime = 'nodejs';

const MAX_BODY = 64_000;

const moment = z.object({ second: z.number().min(0).max(86_400), quote: z.string().max(600) });
// Loose: every field of a source is kept, because the signature covers all of them.
const source = z.union([
  z.looseObject({ kind: z.literal('video'), n: z.number().int().min(1).max(20), youtube_id: z.string().max(20), title: z.string().max(400), moments: z.array(moment).max(5) }),
  z.looseObject({ kind: z.literal('post'), n: z.number().int().min(1).max(20), slug: z.string().max(300), title: z.string().max(400), url: z.string().max(400) }),
]);
const payloadSchema = z.object({
  v: z.literal(1),
  question: z.string().min(1).max(400),
  answer: z.string().min(1).max(12_000),
  sources: z.array(source).max(10),
  followups: z.array(z.string().max(200)).max(5),
  at: z.string().max(40),
});
const bodySchema = z.object({ id: z.string().regex(SHARE_ID_RE), payload: payloadSchema, signature: z.string().min(16).max(128) });

export async function POST(request: NextRequest) {
  const limited = await rateLimit('form', `advisor-share:${hashIp(clientIpFromHeaders(request.headers))}`);
  if (!limited.ok) return NextResponse.json({ error: 'slow down' }, { status: 429 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413 });
  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(JSON.parse(raw));
    if (!result.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  // Verify the payload exactly as the browser sent it.
  const payload = parsed.payload as unknown as AdvisorSharePayload;
  if (!verifyShare(payload, parsed.signature)) return NextResponse.json({ error: 'not an advisor answer' }, { status: 403 });
  if (!isServiceRoleConfigured()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  const db = createAdminClient() as unknown as AdvisorDb;
  const { error } = await db
    .from('advisor_shares')
    .insert({ id: parsed.id, question: payload.question.slice(0, 400), payload: payload as never, is_demo: isDemoRequest(request) });
  if (error) {
    if (error.code !== '23505') {
      console.error('[advisor] share insert failed:', error.message);
      return NextResponse.json({ error: 'failed' }, { status: 500 });
    }
    // The id exists: fine if it's the same answer (a retry), a conflict otherwise.
    const { data } = await db.from('advisor_shares').select('payload').eq('id', parsed.id).maybeSingle();
    if (!data || stableStringify(data.payload) !== stableStringify(payload)) return NextResponse.json({ error: 'id taken' }, { status: 409 });
  }
  return NextResponse.json({ id: parsed.id, path: `/ask/a/${parsed.id}/` }, { status: 201 });
}
