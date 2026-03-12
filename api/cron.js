export const config = { runtime: "edge" };

var SYSTEM_PROMPT =
  "Tu es un analyste macro senior dans un prop trading desk." +
  " Tu prépares le morning briefing pour un scalper NQ futures." +
  "\n\nDATE: Nous sommes en MARS 2026." +
  " Base-toi UNIQUEMENT sur les titres RSS fournis." +
  "\n\nINTERDIT de donner des prix. Concentre-toi sur contexte, analyse, scénarios." +
  "\n\nInclus une section volatilité: analyse le VIX implicite, la chaleur des news," +
  " les ranges Asia/London, et donne une prédiction de volatilité pour la session US" +
  " (LOW/MEDIUM/HIGH/EXTREME) avec justification." +
  "\n\nRéponds UNIQUEMENT en JSON valide." +
  "\n\n{" +
  '\n  "verdict":{"bias":"BULLISH|BEARISH|NEUTRE","confidence":"HIGH|MEDIUM|LOW","title":"5-8 mots","summary":"4-6 phrases","bull_case":"2 phrases","bear_case":"2 phrases"},' +
  '\n  "volatility":{"level":"LOW|MEDIUM|HIGH|EXTREME","vix_assessment":"VIX context 1-2 phrases","expected_range":"Volatilité attendue session US 1-2 phrases","key_times":"Horaires CET des pics de vol attendus"},' +
  '\n  "flows":"Flux institutionnels 3 phrases",' +
  '\n  "intermarket":"Corrélations 2-3 phrases",' +
  '\n  "session_plan":"Plan session CET 3 phrases",' +
  '\n  "week_summary":"Résumé semaine 3-4 phrases",' +
  '\n  "news":[{"title":"Titre","impact":"HIGH|MEDIUM","bias":"BULL|BEAR|NEUTRE","detail":"1-2 phrases"}]' +
  "\n}" +
  "\n\nMinimum 6 news. JSON VALIDE.";

var FEED_URLS = [
  "https://www.investing.com/rss/news.rss",
  "https://www.investing.com/rss/news_14.rss",
  "https://www.investing.com/rss/news_25.rss",
  "https://feeds.marketwatch.com/marketwatch/topstories/"
];
var FEED_TAGS = ["General", "Economy", "Stocks", "MarketWatch"];

async function fetchFeed(url) {
  try {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, 3000);
    var r = await fetch(url, { signal: c.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(t);
    if (!r.ok) return [];
    var txt = await r.text();
    var items = [];
    var re = /<item[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
    var m;
    while ((m = re.exec(txt)) !== null && items.length < 4) {
      var s = (m[1] || "").replace(/<[^>]*>/g, "").trim();
      if (s.length > 10) items.push(s);
    }
    return items;
  } catch (e) { return []; }
}

async function kvSet(key, value) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  await fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", key, value])
  });
}

async function kvGet(key) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  var r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", key])
  });
  var d = await r.json();
  return d.result || null;
}

async function sendDiscord(webhook, payload) {
  if (!webhook) return;
  await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export default async function handler(request) {
  // Verify cron secret
  var authHeader = request.headers.get("authorization");
  if (authHeader !== "Bearer " + process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Check if auto-scan is enabled
    var settings = await kvGet("fb_settings");
    var cfg = settings ? JSON.parse(settings) : {};
    if (cfg.autoDisabled) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Fetch feeds
    var results = await Promise.allSettled(FEED_URLS.map(function (u) { return fetchFeed(u); }));
    var parts = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled" && results[i].value.length > 0) {
        parts.push("[" + FEED_TAGS[i] + "] " + results[i].value.join(" | "));
      }
    }
    var headlinesText = parts.length > 0 ? parts.join("\n") : "(RSS indisponibles)";

    var now = new Date();
    var ds = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var ts = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

    // Call Claude
    var apiKey = process.env.ANTHROPIC_API_KEY;
    var MODELS = ["claude-sonnet-4-20250514", "claude-sonnet-4-6"];
    var aiData = null;

    for (var mi = 0; mi < MODELS.length; mi++) {
      try {
        var c = new AbortController();
        var t = setTimeout(function () { c.abort(); }, 20000);
        var resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal: c.signal,
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODELS[mi], max_tokens: 1500, system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: ds + " " + ts + " CET. Briefing NQ. AUCUN PRIX.\n\n" + headlinesText }]
          })
        });
        clearTimeout(t);
        var result = await resp.json();
        if (result.error && result.error.type === "overloaded_error" && mi < MODELS.length - 1) continue;
        if (!result.error) {
          var full = "";
          for (var bi = 0; bi < (result.content || []).length; bi++) {
            if (result.content[bi].type === "text") full += result.content[bi].text;
          }
          var cleaned = full.replace(/```json|```/g, "").trim();
          var match = cleaned.match(/\{[\s\S]*\}/);
          if (match) {
            try { aiData = JSON.parse(match[0]); } catch (e) {
              try { aiData = JSON.parse(match[0].replace(/,(\s*[}\]])/g, "$1")); } catch (e2) {}
            }
          }
        }
        break;
      } catch (e) { clearTimeout(t); if (mi < MODELS.length - 1) continue; }
    }

    if (!aiData) {
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Store in KV
    var stored = { data: aiData, time: now.toISOString() };
    await kvSet("fb_briefing", JSON.stringify(stored));

    // Send to Discord
    var wh1 = cfg.webhook1 || "";
    var wh2 = cfg.webhook2 || "";
    var v = aiData.verdict || {};
    var col = v.bias === "BULLISH" ? 0x00e676 : v.bias === "BEARISH" ? 0xff5252 : 0xffa726;
    var em = v.bias === "BULLISH" ? "🟢" : v.bias === "BEARISH" ? "🔴" : "🟡";
    var vol = aiData.volatility || {};
    var volEmoji = vol.level === "EXTREME" ? "🔴🔴" : vol.level === "HIGH" ? "🔴" : vol.level === "MEDIUM" ? "🟡" : "🟢";
    var dateLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    // Message 1: Verdict + Analysis
    if (wh1) {
      await sendDiscord(wh1, {
        content: "# ⚡ FLOW BRIEFING — " + dateLabel.toUpperCase(),
        embeds: [
          { title: em + " " + v.bias + " (" + v.confidence + ")", description: "**" + (v.title || "") + "**\n\n" + (v.summary || "").slice(0, 900), color: col },
          { title: "🎯 Scénarios", description: ("**▲ BULL:** " + (v.bull_case || "—") + "\n\n**▼ BEAR:** " + (v.bear_case || "—")).slice(0, 1024), color: col },
          { title: volEmoji + " Volatilité: " + (vol.level || "—"), description: ((vol.vix_assessment || "") + "\n" + (vol.expected_range || "") + "\n⏰ " + (vol.key_times || "")).slice(0, 1024), color: vol.level === "HIGH" || vol.level === "EXTREME" ? 0xff5252 : 0xffa726 },
          { title: "💰 Flux", description: (aiData.flows || "—").slice(0, 1024), color: 0x00d4ff },
          { title: "🔗 Intermarché", description: (aiData.intermarket || "—").slice(0, 1024), color: 0xffa726 },
          { title: "📋 Semaine", description: (aiData.week_summary || "—").slice(0, 1024), color: 0x34d399 },
          { title: "📅 Session", description: (aiData.session_plan || "—").slice(0, 1024), color: 0xf472b6 }
        ]
      });
    }

    // Message 2: News
    if (wh2) {
      var nws = (aiData.news || []).map(function (n) {
        var ic = n.bias === "BULL" ? "🟢" : n.bias === "BEAR" ? "🔴" : "⚪";
        return ic + " **[" + n.impact + "]** " + n.title + "\n" + (n.detail || "");
      }).join("\n\n");
      await sendDiscord(wh2, {
        content: "# 📰 NEWS BRIEFING — " + dateLabel.toUpperCase(),
        embeds: [
          { title: "⚠️ Market News (" + (aiData.news || []).length + ")", description: (nws || "—").slice(0, 4000), color: 0xff4444 }
        ]
      });
    }

    return new Response(JSON.stringify({ ok: true, model: "sonnet" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err && err.message) || "Error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
