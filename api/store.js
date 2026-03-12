export const config = { runtime: "edge" };

async function kvOp(cmd) {
  var url = process.env.KV_REST_API_URL;
  var token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  var r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  var d = await r.json();
  return d.result;
}

export default async function handler(request) {
  var hdrs = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "Content-Type" };
  if (request.method === "OPTIONS") return new Response("ok", { headers: hdrs });

  var reqUrl = new URL(request.url);
  var key = reqUrl.searchParams.get("key") || "briefing";

  if (request.method === "GET") {
    try {
      var raw = await kvOp(["GET", "fb_" + key]);
      if (!raw) return new Response(JSON.stringify({ data: null }), { status: 200, headers: hdrs });
      return new Response(raw, { status: 200, headers: hdrs });
    } catch (e) {
      return new Response(JSON.stringify({ data: null }), { status: 200, headers: hdrs });
    }
  }

  if (request.method === "POST") {
    try {
      var body = await request.json();
      await kvOp(["SET", "fb_" + key, JSON.stringify(body)]);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: hdrs });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: hdrs });
    }
  }

  return new Response(JSON.stringify({ error: "Bad method" }), { status: 405, headers: hdrs });
}
