import { NextRequest, NextResponse } from 'next/server';
import { searchVideos } from '../_lib/data';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get('q') || '';
  const category = sp.get('category') || undefined;
  const page = parseInt(sp.get('page') || '1', 10);
  const limit = parseInt(sp.get('limit') || '20', 10);

  const data = searchVideos(q, { page, limit, category });

  return NextResponse.json(data);
}
