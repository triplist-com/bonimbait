import 'server-only';

/**
 * Reading shared answers (advisor_shares) for /ask/a/<id>/. The table has no
 * API access: the page reads it server-side with the service role, so share
 * ids can't be listed. Snapshots never change, so callers cache freely.
 */
import { cache } from 'react';
import { createAdminClient, isServiceRoleConfigured } from '@/lib/supabase/admin';
import { withTimeout } from '@/lib/platform/db';
import { SHARE_ID_RE } from './share';
import type { AdvisorDb } from './threads';
import type { AdvisorSharePayload } from './types';

export interface SharedAnswer {
  id: string;
  payload: AdvisorSharePayload;
  createdAt: string;
}

function isPayload(v: unknown): v is AdvisorSharePayload {
  const p = v as AdvisorSharePayload;
  return Boolean(p) && p.v === 1 && typeof p.question === 'string' && typeof p.answer === 'string' && Array.isArray(p.sources) && Array.isArray(p.followups);
}

export const loadSharedAnswer = cache(async (id: string): Promise<SharedAnswer | null> => {
  if (!SHARE_ID_RE.test(id) || !isServiceRoleConfigured()) return null;
  const db = createAdminClient() as unknown as AdvisorDb;
  const { data, error } = await withTimeout(db.from('advisor_shares').select('id, payload, created_at').eq('id', id).maybeSingle(), 3000, 'advisor share');
  if (error) throw new Error(error.message);
  if (!data || !isPayload(data.payload)) return null;
  return { id: data.id, payload: data.payload, createdAt: data.created_at };
});
