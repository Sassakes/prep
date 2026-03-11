export const config = { runtime: 'edge' };

var FEEDS = [
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', name: 'MarketWatch' },
  { url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/', name: 'MW Pulse' },
  { url: 'https://www.investing.com/rss/news.rss', name: 'Investing' },
];

async function fetchFeed(url, timeout) {
  try {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, timeout);
    var r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    clearTimeout(t);
    if (!r.ok) return '';
    var text = await r.text();
    var items = [];
    var re = /<item[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gi;
    var m;
    while ((m = re.exec(text)) !== null && items.length < 12) {
      items.push(m[1].replace(/<[^>]*>/g, '').trim());
    }
    return items.join('\n');
  } catch (e) {
    return '';
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY missing' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    var body = await req.json();

    // Step 1: Fetch RSS feeds in parallel (4s timeout each)
    var feedResults = await Promise.all(
      FEEDS.map(function (f) { return fetchFeed(f.url, 4000); })
    );

    var newsData = '';
    for (var i = 0; i < FEEDS.length; i++) {
      if (feedResults[i]) {
        newsData += '\n--- ' + FEEDS[i].name + ' ---\n' + feedResults[i];
      }
    }

    // Step 2: Inject data into user message
    var messages = body.messages || [];
    if (messages.length > 0 && newsData) {
      messages[0].content = messages[0].content +
        '\n\nTitres financiers récupérés en temps réel:\n' + newsData;
    }

    // Step 3: Claude analysis WITHOUT web search = fast 3-5s
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 20000);

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: body.max_tokens || 1500,
        system: body.system || '',
        messages: messages,
      }),
    });

    clearTimeout(timer);
    var data = await resp.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    var msg = err.name === 'AbortError' ? 'Timeout' : err.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
