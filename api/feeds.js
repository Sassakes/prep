export const config = { runtime: "edge" };

var FEEDS = [
  { url: "https://www.investing.com/rss/news.rss", tag: "General" },
  { url: "https://www.investing.com/rss/news_14.rss", tag: "Economie" },
  { url: "https://www.investing.com/rss/news_25.rss", tag: "Actions" },
  { url: "https://www.investing.com/rss/news_1.rss", tag: "Forex" },
  { url: "https://www.investing.com/rss/news_11.rss", tag: "Matieres Premieres" },
  { url: "https://www.investing.com/rss/news_285.rss", tag: "Fed" },
  { url: "https://www.investing.com/rss/news_95.rss", tag: "Crypto" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", tag: "MarketWatch" }
];

async function fetchOne(url) {
  try {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, 3000);
    var r = await fetch(url, { signal: c.signal, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    clearTimeout(t);
    if (!r.ok) return [];
    var txt = await r.text();
    var items = [];
    var re = /<item[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
    var m;
    while ((m = re.exec(txt)) !== null && items.length < 5) {
      var title = (m[1] || "").replace(/<[^>]*>/g, "").trim();
      if (title.length > 10) items.push(title);
    }
    return items;
  } catch (e) { return []; }
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  try {
    var results = await Promise.allSettled(FEEDS.map(function (f) { return fetchOne(f.url); }));
    var output = [];
    for (var i = 0; i < results.length; i++) {
      var items = results[i].status === "fulfilled" ? results[i].value : [];
      if (items.length > 0) output.push({ tag: FEEDS[i].tag, items: items });
    }
    return new Response(JSON.stringify({ feeds: output }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
