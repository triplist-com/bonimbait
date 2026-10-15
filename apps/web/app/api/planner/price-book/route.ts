import { NextResponse } from 'next/server';
import { loadPriceBook } from '@/lib/planner/price-book';

/**
 * GET /api/planner/price-book: the current planner price book, for client
 * trees that render the planner without a server parent (the cost CTA modal
 * under an AI answer). In-process: no backend, public data only.
 */
export const revalidate = 600;

export async function GET() {
  const version = await loadPriceBook();
  return NextResponse.json(
    { book: version.book, version: version.id, updatedAt: version.createdAt },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
