import type { NextRequest } from 'next/server';
import { handleAdvisorStream } from '@/lib/advisor/pipeline';

/**
 * The advisor's answer stream (SSE). The pipeline lives in lib/advisor
 * (retrieval, exact moments, the model call, guards and analytics); this
 * route only exposes it. Protocol: lib/advisor/types.ts (AdvisorEvent).
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export function POST(request: NextRequest): Promise<Response> {
  return handleAdvisorStream(request);
}
