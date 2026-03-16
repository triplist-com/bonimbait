import { NextResponse } from 'next/server';
import { getCategories } from '../_lib/data';

export async function GET() {
  const categories = getCategories().map((c) => ({
    id: c.slug,
    name_he: c.name_he,
    slug: c.slug,
    description_he: c.description_he,
    video_count: c.video_count,
  }));

  return NextResponse.json({ categories });
}
