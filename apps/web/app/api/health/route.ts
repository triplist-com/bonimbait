import { NextResponse } from 'next/server';
import { getTotalVideoCount, getCategories } from '../_lib/data';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    video_count: getTotalVideoCount(),
    category_count: getCategories().length,
  });
}
