export const config = { runtime: "edge" };

var MODELS = ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"];

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  try {
    var body = await request.json();
    for (var i = 0; i < MODELS.length; i++) {
      try {
        var c = new AbortController();
        var t = setTimeout(function () { c.abort(); }, 28000);
        var resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal: c.signal,
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODELS[i], max_tokens: 1200, system: body.system || "", messages: body.messages || [] })
        });
        clearTimeout(t);
        var data = await resp.json();
        if (data.error && data.error.type === "overloaded_error" && i < MODELS.length - 1) continue;
        return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      } catch (e) { clearTimeout(t); if (i < MODELS.length - 1) continue; throw e; }
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err && err.name === "AbortError") ? "Timeout" : (err && err.message) || "Error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
