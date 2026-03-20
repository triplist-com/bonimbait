import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';

    const backendRes = await fetch(
      `${BACKEND_URL}/api/wizard/prefill?q=${encodeURIComponent(q)}`,
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );

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
    console.error('Wizard prefill proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy prefill request' },
      { status: 502 },
    );
  }
}
