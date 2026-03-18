import { NextRequest, NextResponse } from 'next/server';
import { getSuggestions } from '../_lib/data';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const suggestions = getSuggestions(q);
  return NextResponse.json({ suggestions });
}
