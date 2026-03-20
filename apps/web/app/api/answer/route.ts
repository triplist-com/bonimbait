import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const REQUEST_TIMEOUT = 10_000; // 10 seconds

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let backendRes: Response;
    try {
      backendRes = await fetch(`${BACKEND_URL}/api/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        return NextResponse.json(
          { error: 'הבקשה ארכה זמן רב מדי. אנא נסו שוב.' },
          { status: 504 },
        );
      }
      // Backend unreachable
      return NextResponse.json(
        { error: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.' },
        { status: 502 },
      );
    }
    clearTimeout(timeoutId);

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      // Return Hebrew error for gateway errors
      if (backendRes.status >= 502 && backendRes.status <= 504) {
        const messages: Record<number, string> = {
          502: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.',
          503: 'השירות בתחזוקה זמנית. אנא נסו שוב בקרוב.',
          504: 'הבקשה ארכה זמן רב מדי. אנא נסו שוב.',
        };
        return NextResponse.json(
          { error: messages[backendRes.status] || errorText },
          { status: backendRes.status },
        );
      }
      return NextResponse.json(
        { error: errorText || 'Backend error' },
        { status: backendRes.status },
      );
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Answer proxy error:', error);
    return NextResponse.json(
      { error: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.' },
      { status: 502 },
    );
  }
}
