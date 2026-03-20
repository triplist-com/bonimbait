import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/wizard/questions`, {
      headers: { 'Content-Type': 'application/json' },
    });

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
    console.error('Wizard questions proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wizard questions' },
      { status: 502 },
    );
  }
}
