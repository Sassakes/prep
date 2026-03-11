export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // Safety: enforce Haiku + limit tokens
    body.model = 'claude-haiku-4-5-20251001';
    if (body.max_tokens > 3000) body.max_tokens = 3000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s hard limit

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    const msg = error.name === 'AbortError'
      ? 'Request timeout (25s) - try again'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: error.name === 'AbortError' ? 504 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
