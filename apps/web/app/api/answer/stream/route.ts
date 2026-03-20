import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const STREAM_TIMEOUT = 30_000; // 30 seconds for streaming

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

    let backendRes: Response;
    try {
      backendRes = await fetch(`${BACKEND_URL}/api/answer/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'הבקשה ארכה זמן רב מדי. אנא נסו שוב.' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // Backend unreachable
      return new Response(
        JSON.stringify({ error: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }
    clearTimeout(timeoutId);

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      if (backendRes.status >= 502 && backendRes.status <= 504) {
        const messages: Record<number, string> = {
          502: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.',
          503: 'השירות בתחזוקה זמנית. אנא נסו שוב בקרוב.',
          504: 'הבקשה ארכה זמן רב מדי. אנא נסו שוב.',
        };
        return new Response(
          JSON.stringify({ error: messages[backendRes.status] || errorText }),
          { status: backendRes.status, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: errorText || 'Backend error' }), {
        status: backendRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward the SSE stream from the backend to the client
    const stream = backendRes.body;
    if (!stream) {
      return new Response(JSON.stringify({ error: 'No stream body from backend' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Answer stream proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'השרת אינו זמין כרגע. אנא נסו שוב בעוד מספר דקות.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
