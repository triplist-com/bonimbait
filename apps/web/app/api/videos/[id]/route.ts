import { NextRequest, NextResponse } from 'next/server';
import { getVideo } from '../../_lib/data';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const video = getVideo(params.id);

  if (!video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  // Map to frontend VideoDetail shape
  const detail = {
    id: video.id,
    youtube_id: video.youtube_id,
    title: video.title,
    channel_name: 'בונים בית',
    duration_seconds: video.duration_seconds,
    published_at: video.published_at,
    category_id: video.category_slug,
    category_name: video.category_name_he,
    category_slug: video.category_slug,
    thumbnail_url: video.thumbnail_url,
    view_count: video.view_count,
    summary: video.summary || undefined,
    key_points: video.key_points?.length
      ? video.key_points.map((text) => ({ text }))
      : undefined,
    costs_data: video.costs?.length
      ? video.costs.map((c) => ({
          item: c.item,
          price: c.price,
          unit: c.unit,
          context: c.context,
        }))
      : undefined,
    tips: video.tips?.length ? video.tips : undefined,
    warnings: video.warnings?.length ? video.warnings : undefined,
    rules: video.rules?.length ? video.rules : undefined,
    materials: video.materials?.length ? video.materials : undefined,
    difficulty_level: video.difficulty_level || undefined,
    has_transcript: video.has_transcript,
    segment_count: video.segment_count,
  };

  return NextResponse.json(detail);
}
