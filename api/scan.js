export const config = { runtime: "edge" };

/* Investing.com RSS + MarketWatch + CNBC */
var FEEDS = [
  { url: "https://www.investing.com/rss/news.rss", tag: "Investing" },
  { url: "https://www.investing.com/rss/news_1.rss", tag: "Forex" },
  { url: "https://www.investing.com/rss/news_11.rss", tag: "Commodities" },
  { url: "https://www.investing.com/rss/news_25.rss", tag: "Stocks" },
  { url: "https://www.investing.com/rss/news_14.rss", tag: "Economy" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", tag: "MarketWatch" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", tag: "CNBC" }
];

async function fetchFeed(url) {
  try {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, 3500);
    var r = await fetch(url, {
      signal: c.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    clearTimeout(t);
    if (!r.ok) return [];
    var txt = await r.text();
    var items = [];
    var re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
    var m;
    while ((m = re.exec(txt)) !== null) {
      var s = m[1].replace(/<[^>]*>/g, "").trim();
      if (s.length > 15 && items.length < 8) items.push(s);
    }
    return items;
  } catch (e) { return []; }
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  try {
    var body = await request.json();
    var userContent = "";
    if (body.messages && body.messages.length > 0) {
      userContent = body.messages[0].content || "";
    }

    /* Fetch all RSS in parallel (3.5s timeout each, silent fail) */
    var results = await Promise.allSettled(
      FEEDS.map(function (f) { return fetchFeed(f.url); })
    );

    var sections = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled" && results[i].value.length > 0) {
        sections.push("[" + FEEDS[i].tag + "]\n" + results[i].value.join("\n"));
      }
    }

    if (sections.length > 0) {
      userContent = userContent +
        "\n\n===== FLUX RSS EN TEMPS RÉEL =====\n" +
        sections.join("\n\n");
    }

    /* Call Claude — NO web search */
    var c2 = new AbortController();
    var t2 = setTimeout(function () { c2.abort(); }, 20000);

    var resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: c2.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        system: body.system || "",
        messages: [{ role: "user", content: userContent }]
      })
    });
    clearTimeout(t2);

    var data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    var msg = err && err.name === "AbortError" ? "Timeout" : (err && err.message) || "Error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
