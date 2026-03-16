import { NextRequest, NextResponse } from 'next/server';
import { getVideos } from '../_lib/data';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const page = parseInt(sp.get('page') || '1', 10);
  const limit = parseInt(sp.get('limit') || '20', 10);
  const category = sp.get('category') || undefined;
  const sort = sp.get('sort') || 'newest';

  const data = getVideos({ page, limit, category, sort });

  // Map to frontend Video shape
  const videos = data.videos.map((v) => ({
    id: v.id,
    youtube_id: v.youtube_id,
    title: v.title,
    channel_name: 'בונים בית',
    duration_seconds: v.duration_seconds,
    published_at: v.published_at,
    category_id: v.category_slug,
    category_name: v.category_name_he,
    category_slug: v.category_slug,
    thumbnail_url: v.thumbnail_url,
    view_count: v.view_count,
  }));

  return NextResponse.json({
    videos,
    total: data.total,
    page: data.page,
    pages: data.pages,
  });
}
