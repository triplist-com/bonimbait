import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const backendRes = await fetch(`${BACKEND_URL}/api/answer/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
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
    return new Response(JSON.stringify({ error: 'Failed to proxy stream request' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
