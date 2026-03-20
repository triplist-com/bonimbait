import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');

  if (!q || q.trim().length < 3) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required (min 3 characters).' },
      { status: 400 },
    );
  }

  try {
    const backendRes = await fetch(
      `${BACKEND_URL}/api/answer/pregenerated?q=${encodeURIComponent(q)}`,
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (backendRes.status === 404) {
      return NextResponse.json(
        { error: 'No pre-generated answer found.' },
        { status: 404 },
      );
    }

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json(
        { error: errorText || 'Backend error' },
        { status: backendRes.status },
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Pregenerated answer proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy pregenerated answer request' },
      { status: 502 },
    );
  }
}
