export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: 'API key missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    var body = await req.json();
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 28000);

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model || 'claude-haiku-4-5-20251001',
        max_tokens: body.max_tokens || 1500,
        system: body.system || '',
        tools: body.tools || undefined,
        messages: body.messages || [],
      }),
    });

    clearTimeout(timer);
    var data = await resp.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.name === 'AbortError' ? 'Timeout 28s' : err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
