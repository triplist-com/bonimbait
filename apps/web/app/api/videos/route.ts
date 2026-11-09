import { NextRequest, NextResponse } from 'next/server';
import { mergeForSort, type RuntimeListItem } from '@/lib/autopilot/listing';
import { listPublishedRuntimeVideoItems } from '@/lib/autopilot/video-list';
import { listVideos, pageParams, type VideoRecord } from '../_lib/data';

// Frontend Video shape (lib/types.ts)
function staticVideo(v: VideoRecord) {
  return {
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
    summary: v.summary || undefined,
    costs_count: v.costs?.length || 0,
    tips_count: v.tips?.length || 0,
  };
}

// A published Content Autopilot video; its page is /video/<youtube-id>/.
function runtimeVideo(v: RuntimeListItem): ReturnType<typeof staticVideo> {
  return {
    id: v.youtube_id,
    youtube_id: v.youtube_id,
    title: v.title,
    channel_name: 'בונים בית',
    duration_seconds: v.duration_s ?? 0,
    published_at: v.published_at ?? '',
    category_id: v.category_slug,
    category_name: v.category_name,
    category_slug: v.category_slug,
    thumbnail_url: v.thumbnail_url,
    view_count: 0,
    summary: v.summary || undefined,
    costs_count: v.costs_count,
    tips_count: v.tips_count,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { page, limit } = pageParams({
    page: parseInt(sp.get('page') || '1', 10),
    limit: parseInt(sp.get('limit') || '20', 10),
  });
  const category = sp.get('category') || undefined;
  const sort = sp.get('sort') || 'newest';

  // Static index plus published Content Autopilot videos (static wins on a shared id).
  const statics = listVideos({ category, sort });
  const staticIds = new Set(listVideos({}).map((v) => v.youtube_id));
  const runtime = (await listPublishedRuntimeVideoItems()).filter(
    (v) => !staticIds.has(v.youtube_id) && (!category || v.category_slug === category),
  );
  const all = mergeForSort(statics.map(staticVideo), runtime.map(runtimeVideo), sort);

  const total = all.length;
  const start = (page - 1) * limit;
  return NextResponse.json({
    videos: all.slice(start, start + limit),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
