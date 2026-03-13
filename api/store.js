export const config = { runtime: "edge" };

export default async function handler(request) {
  var hdrs = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST", "Access-Control-Allow-Headers": "Content-Type" };
  if (request.method === "OPTIONS") return new Response("ok", { headers: hdrs });

  var kvUrl = process.env.KV_REST_API_URL;
  var kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return new Response(JSON.stringify({ data: null, error: "KV not configured" }), { status: 200, headers: hdrs });
  }

  var reqUrl = new URL(request.url);
  var key = "fb_" + (reqUrl.searchParams.get("key") || "briefing");

  try {
    if (request.method === "GET") {
      var r = await fetch(kvUrl + "/get/" + key, {
        headers: { "Authorization": "Bearer " + kvToken }
      });
      var d = await r.json();
      if (d.result) {
  var parsed = d.result;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch (e) {}
  }
  return new Response(JSON.stringify(parsed), { status: 200, headers: hdrs });
}
      return new Response(JSON.stringify({ data: null }), { status: 200, headers: hdrs });
    }

    if (request.method === "POST") {
      var body = await request.text();
await fetch(kvUrl + "/set/" + key, {
  method: "POST",
  headers: { "Authorization": "Bearer " + kvToken },
  body: body
});
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: hdrs });
    }
  } catch (e) {
    return new Response(JSON.stringify({ data: null, error: e.message }), { status: 200, headers: hdrs });
  }

  return new Response(JSON.stringify({ error: "Bad method" }), { status: 405, headers: hdrs });
}
