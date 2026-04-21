import { NextRequest, NextResponse } from 'next/server';
import { semanticSearchSegments, groupByVideo } from '../_lib/semantic';
import { getVideo } from '../_lib/data';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const category = sp.get('category') || undefined;
  const page = parseInt(sp.get('page') || '1', 10);
  const limit = parseInt(sp.get('limit') || '20', 10);

  if (!q) {
    return NextResponse.json({ results: [], total: 0, query: q });
  }

  let hits;
  try {
    hits = await semanticSearchSegments(q, 60);
  } catch (err) {
    console.error('semantic search failed:', err);
    return NextResponse.json(
      { results: [], total: 0, query: q, error: 'search_unavailable' },
      { status: 502 },
    );
  }

  // Group by video, keep best-scoring segment per video
  const grouped = groupByVideo(hits);
  const perVideo: Array<{
    youtube_id: string;
    bestScore: number;
    bestSeg: (typeof hits)[number];
  }> = [];
  for (const [yt, segs] of grouped.entries()) {
    segs.sort((a, b) => b.score - a.score);
    perVideo.push({ youtube_id: yt, bestScore: segs[0].score, bestSeg: segs[0] });
  }
  perVideo.sort((a, b) => b.bestScore - a.bestScore);

  const enriched = perVideo
    .map((p) => {
      const v = getVideo(p.youtube_id);
      if (!v) return null;
      if (category && v.category_slug !== category) return null;
      const snippet = p.bestSeg.text.slice(0, 200) + (p.bestSeg.text.length > 200 ? '…' : '');
      return {
        video_id: v.id,
        youtube_id: v.youtube_id,
        title: v.title,
        summary: v.summary,
        thumbnail_url: v.thumbnail_url,
        duration_seconds: v.duration_seconds,
        published_at: v.published_at,
        category_slug: v.category_slug,
        category_name: v.category_name_he,
        score: p.bestSeg.cos,
        snippet,
        matching_segment_time: p.bestSeg.start_time,
      };
    })
    .filter(Boolean);

  const total = enriched.length;
  const start = (Math.max(1, page) - 1) * Math.max(1, limit);
  const results = enriched.slice(start, start + Math.max(1, limit));

  return NextResponse.json({ results, total, query: q });
}
