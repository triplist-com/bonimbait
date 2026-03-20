import { NextResponse } from 'next/server';
import { getCategories } from '../_lib/data';

export async function GET() {
  const categories = getCategories().map((c) => ({
    id: c.slug,
    name_he: c.name_he,
    slug: c.slug,
    description_he: c.description_he,
    video_count: c.video_count,
    ai_summary: c.ai_summary ?? null,
    ai_key_points: c.ai_key_points ?? null,
    ai_costs_data: c.ai_costs_data ?? null,
    ai_tips: c.ai_tips ?? null,
    ai_warnings: c.ai_warnings ?? null,
  }));

  return NextResponse.json({ categories });
}
