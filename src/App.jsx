import { useState, useEffect, useCallback } from "react";

var PROMPT = "Tu es un analyste macro pour un scalper NQ. Cherche les données marché ACTUELLES et donne un briefing.\n\nRÉPONDS EN JSON UNIQUEMENT. Aucun texte hors JSON.\n\n{\"movers\":[{\"name\":\"NQ\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"ES\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"RTY\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"VIX\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"DXY\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"WTI\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"Gold\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"10Y\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"},{\"name\":\"EUR/USD\",\"price\":0,\"pct\":\"+0.0%\",\"dir\":\"up\"}],\"verdict\":{\"bias\":\"BULLISH\",\"confidence\":\"HIGH\",\"summary\":\"3-5 phrases tradables avec niveaux NQ\",\"levels\":\"R:XXXXX | Pivot:XXXXX | S:XXXXX\",\"scenarios\":[{\"label\":\"BULL\",\"prob\":\"60%\",\"trigger\":\"condition\",\"target\":\"XXXXX\"},{\"label\":\"BEAR\",\"prob\":\"40%\",\"trigger\":\"condition\",\"target\":\"XXXXX\"}]},\"flows\":\"2-3 phrases sur les flux dominants\",\"correlations\":\"DXY vs NQ, yields, oil, gold\",\"news\":[{\"title\":\"titre\",\"impact\":\"high\",\"bias\":\"bullish\",\"summary\":\"1 phrase\"}],\"events\":[{\"name\":\"Event\",\"date\":\"JJ/MM HH:MM CET\",\"consensus\":\"X%\",\"if_above\":\"bull/bear\",\"if_below\":\"bull/bear\"}]}\n\nIMPÉRATIF: prix RÉELS actuels, niveaux NQ concrets, minimum 6 news, minimum 3 events éco de la semaine.";

function getSessions() {
  var now = new Date();
  var cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  var t = cet.getHours() * 60 + cet.getMinutes();
  var list = [
    { n: "London", h: 9 }, { n: "EU Overlap", h: 14 }, { n: "US Data", h: 14.5 },
    { n: "US Open", h: 15.5 }, { n: "Power Hour", h: 21 }, { n: "Close", h: 22 }
  ];
  return list.map(function (s) {
    var m = s.h * 60;
    var d = m - t;
    var st = d < -30 ? "done" : d < 0 ? "live" : d < 60 ? "soon" : "wait";
    var lb = st === "done" ? "" : st === "live" ? "LIVE" : Math.floor(d / 60) + "h" + String(d % 60).padStart(2, "0");
    return { n: s.n, st: st, lb: lb, tm: String(Math.floor(s.h)).padStart(2, "0") + ":" + (s.h % 1 ? "30" : "00") };
  });
}

export default function App() {
  var _d = useState(null), data = _d[0], setData = _d[1];
  var _l = useState(false), loading = _l[0], setLoading = _l[1];
  var _e = useState(null), error = _e[0], setError = _e[1];
  var _r = useState(null), refreshed = _r[0], setRefreshed = _r[1];
  var _s = useState(getSessions()), sess = _s[0], setSess = _s[1];
  var _sh = useState(false), showSet = _sh[0], setShowSet = _sh[1];
  var _wh = useState(""), hook = _wh[0], setHook = _wh[1];
  var _tw = useState(""), tmpHook = _tw[0], setTmpHook = _tw[1];
  var _ds = useState(null), dStatus = _ds[0], setDStatus = _ds[1];
  var _st = useState(""), step = _st[0], setStep = _st[1];

  useEffect(function () {
    try { setHook(localStorage.getItem("flow_wh") || ""); } catch (e) {}
    var t = setInterval(function () { setSess(getSessions()); }, 60000);
    return function () { clearInterval(t); };
  }, []);

  var save = function () {
    setHook(tmpHook);
    try { localStorage.setItem("flow_wh", tmpHook); } catch (e) {}
    setShowSet(false);
  };

  var discord = async function (d) {
    var url = hook || "";
    try { url = localStorage.getItem("flow_wh") || url; } catch (e) {}
    if (!url) return;
    setDStatus("sending");
    try {
      var obj = d || data;
      if (!obj) return;
      var v = obj.verdict || {};
      var col = v.bias === "BULLISH" ? 0x00e676 : v.bias === "BEARISH" ? 0xff5252 : 0xffa726;
      var em = v.bias === "BULLISH" ? "🟢" : v.bias === "BEARISH" ? "🔴" : "🟡";
      var mvs = (obj.movers || []).map(function (m) { return (m.dir === "up" ? "▲" : "▼") + " **" + m.name + "** " + m.price + " (" + m.pct + ")"; }).join("\n");
      var nws = (obj.news || []).filter(function (n) { return n.impact === "high"; }).slice(0, 5).map(function (n) { return (n.bias === "bullish" ? "🟢" : n.bias === "bearish" ? "🔴" : "⚪") + " **" + n.title + "** — " + n.summary; }).join("\n");
      var evs = (obj.events || []).slice(0, 5).map(function (e) { return "⏰ **" + e.name + "** " + e.date + "\n📈 " + (e.if_above || "—") + " | 📉 " + (e.if_below || "—"); }).join("\n\n");
      var scs = (v.scenarios || []).map(function (s) { return "**" + s.label + "** (" + s.prob + ") — " + s.trigger + " → " + s.target; }).join("\n");
      var now = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      var payload = { content: "# ⚡ FLOW BRIEFING — " + now.toUpperCase(), embeds: [
        { title: em + " " + (v.bias || "—") + " (" + (v.confidence || "—") + ")", description: v.summary || "—", color: col, fields: [{ name: "🎯 Niveaux", value: v.levels || "—" }] },
        { title: "🔥 Movers", description: mvs || "—", color: 0x1a1a2e },
        { title: "🎯 Scénarios", description: scs || "—", color: col },
        { title: "⚠️ News", description: nws || "—", color: 0xff4444 },
        { title: "📅 Éco", description: evs || "—", color: 0xf472b6 },
      ]};
      var r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("" + r.status);
      setDStatus("sent");
    } catch (e) { setDStatus("error"); }
    setTimeout(function () { setDStatus(null); }, 3000);
  };

  var scan = useCallback(async function () {
    setLoading(true);
    setError(null);
    setData(null);
    setStep("Scan des marchés en cours...");
    var now = new Date();
    var dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    try {
      var resp = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          system: PROMPT,
          messages: [{ role: "user", content: dateStr + ", " + timeStr + " CET. Morning briefing NQ scalper. Cherche prix actuels NQ ES RTY VIX DXY WTI Gold 10Y EUR/USD + news + calendrier éco semaine." }],
        }),
      });

      var text = await resp.text();
      var result = null;
      try { result = JSON.parse(text); } catch (e) {
        throw new Error("Réponse invalide du serveur: " + text.slice(0, 100));
      }

      if (result.error) {
        throw new Error(typeof result.error === "string" ? result.error : result.error.message || JSON.stringify(result.error));
      }

      var fullText = "";
      var blocks = result.content || [];
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "text" && blocks[i].text) fullText += blocks[i].text;
      }

      if (!fullText) {
        throw new Error("Réponse vide de l'API");
      }

      var cleaned = fullText.replace(/```json|```/g, "").trim();
      var match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error("Pas de JSON: " + fullText.slice(0, 100));
      }

      var parsed = JSON.parse(match[0]);
      setData(parsed);
      setRefreshed(new Date());
      setSess(getSessions());

      try {
        var autoHook = localStorage.getItem("flow_wh") || "";
        if (autoHook) setTimeout(function () { discord(parsed); }, 500);
      } catch (e) {}

    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
    setStep("");
  }, []);

  var sc = function (s) { return s === "live" ? "#00e676" : s === "soon" ? "#ffa726" : s === "done" ? "#333" : "#555"; };

  return (
    <div className="root">
      <style>{CSS}</style>

      <header className="hdr">
        <div className="logo"><div className="lm">⚡</div><div><div className="lt">FLOW BRIEFING</div><div className="ls">Live · AI Analysis</div></div></div>
        <div className="acts">
          {refreshed && <span className="tb">MàJ {refreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
          {data && hook && <button className="btn bd" onClick={function () { discord(); }}>{dStatus === "sending" ? "◌" : "📨"}</button>}
          <button className="btn bg" onClick={function () { setTmpHook(hook); setShowSet(true); }}>⚙</button>
          <button className="btn bp" onClick={scan} disabled={loading}>{loading ? "◌ Scan..." : "↻ Scanner"}</button>
        </div>
      </header>

      {step && <div className="prog"><span className="dot">●</span> {step}</div>}

      {showSet && (
        <div className="mo" onClick={function () { setShowSet(false); }}>
          <div className="md" onClick={function (e) { e.stopPropagation(); }}>
            <h3>⚙ Paramètres</h3>
            <label>Webhook Discord</label>
            <input className="mi" value={tmpHook} onChange={function (e) { setTmpHook(e.target.value); }} placeholder="https://discord.com/api/webhooks/..." />
            <div className="ma"><button className="btn bg" onClick={function () { setShowSet(false); }}>Annuler</button><button className="btn bp" onClick={save}>OK</button></div>
          </div>
        </div>
      )}

      {dStatus && <div className={"toast " + dStatus}>{dStatus === "sending" ? "📨 Envoi..." : dStatus === "sent" ? "✓ Envoyé" : "✗ Erreur"}</div>}

      {!data && !loading && !error && (
        <div className="empty">
          <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 24 }}>⚡</div>
          <h2>FLOW BRIEFING</h2>
          <p>Données marché live + analyse IA en un seul scan.<br />~15 secondes, ~$0.005 par scan.</p>
          <div className="sp">{sess.filter(function (s) { return s.st !== "done"; }).slice(0, 4).map(function (s, i) {
            return <div key={i} className="sc" style={{ borderColor: sc(s.st), color: sc(s.st) }}>{s.n} <b>{s.lb}</b></div>;
          })}</div>
          <button className="bs" onClick={scan}>Scanner les marchés</button>
        </div>
      )}

      {error && !loading && (
        <div className="err">
          <div>⚠ {error}</div>
          <button className="btn bp" onClick={scan} style={{ marginTop: 12 }}>Réessayer</button>
        </div>
      )}

      {loading && !data && (
        <div className="ct">
          <div className="sk" style={{ height: 140, marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div className="sk" style={{ height: 80 }} /><div className="sk" style={{ height: 80 }} /><div className="sk" style={{ height: 80 }} />
          </div>
          <div className="sk" style={{ height: 44, marginBottom: 4 }} />
          <div className="sk" style={{ height: 44, marginBottom: 4 }} />
          <div className="sk" style={{ height: 44, marginBottom: 4 }} />
        </div>
      )}

      {data && (
        <div className="ct">

          <div className="sb">{sess.map(function (s, i) {
            return <div key={i} className="si" style={{ opacity: s.st === "done" ? 0.3 : 1 }}>
              <div className="sd" style={{ background: sc(s.st) }} /><div className="sn">{s.n}</div><div className="stm">{s.tm}</div><div className="slb" style={{ color: sc(s.st) }}>{s.lb}</div>
            </div>;
          })}</div>

          {data.verdict && (
            <div className={"vc fade " + (data.verdict.bias === "BULLISH" ? "bull" : data.verdict.bias === "BEARISH" ? "bear" : "neu")}>
              <div className="vh">
                <div className="vb" style={{ color: data.verdict.bias === "BULLISH" ? "var(--g)" : data.verdict.bias === "BEARISH" ? "var(--r)" : "var(--o)" }}>
                  {data.verdict.bias === "BULLISH" ? "▲ " : data.verdict.bias === "BEARISH" ? "▼ " : "— "}{data.verdict.bias}
                </div>
                <div className="vcf" style={{ background: data.verdict.confidence === "HIGH" ? "rgba(0,230,118,0.1)" : "rgba(255,167,38,0.1)", color: data.verdict.confidence === "HIGH" ? "var(--g)" : "var(--o)" }}>
                  {data.verdict.confidence}
                </div>
              </div>
              <p className="vs">{data.verdict.summary}</p>
              {data.verdict.levels && <div className="vl">🎯 {data.verdict.levels}</div>}
              {data.verdict.scenarios && data.verdict.scenarios.length > 0 && (
                <div className="scs">{data.verdict.scenarios.map(function (s, i) {
                  return <div key={i} className="scn">
                    <div className="sch"><span style={{ color: s.label === "BULL" ? "var(--g)" : "var(--r)", fontWeight: 700 }}>{s.label}</span><span style={{ color: "var(--c)" }}>{s.prob}</span></div>
                    <div className="sct">▸ {s.trigger}</div><div className="scta">▸ Target: {s.target}</div>
                  </div>;
                })}</div>
              )}
            </div>
          )}

          {data.flows && <div className="ib cy fade"><div className="pl">💰 FLUX</div><p>{data.flows}</p></div>}
          {data.correlations && <div className="ib og fade"><div className="pl">🔗 CORRÉLATIONS</div><p>{data.correlations}</p></div>}

          {data.movers && data.movers.length > 0 && (
            <div>
              <div className="st"><span style={{ color: "var(--o)" }}>●</span> MARCHÉ</div>
              <div className="mg">{data.movers.map(function (m, i) {
                var up = m.dir === "up";
                return <div key={i} className="mc fade" style={{ animationDelay: i * 30 + "ms" }}>
                  <div className="mt"><span className="mn">{m.name}</span><span className="mp" style={{ color: up ? "var(--g)" : "var(--r)" }}>{m.pct}</span></div>
                  <div className="mpx">{m.price}</div>
                </div>;
              })}</div>
            </div>
          )}

          {data.news && data.news.length > 0 && (
            <div>
              <div className="st"><span style={{ color: "var(--r)" }}>●</span> NEWS</div>
              <div className="nl">{data.news.map(function (n, i) {
                return <div key={i} className="ni fade" style={{ animationDelay: i * 25 + "ms", borderLeftColor: n.impact === "high" ? "var(--r)" : n.impact === "medium" ? "var(--o)" : "#333" }}>
                  <div className="nh">
                    <span className="it" style={{ color: n.impact === "high" ? "var(--r)" : "var(--o)" }}>{(n.impact || "").toUpperCase()}</span>
                    <span className="nt">{n.title}</span>
                    <span className="nb" style={{ color: n.bias === "bullish" ? "var(--g)" : n.bias === "bearish" ? "var(--r)" : "#78909c" }}>{n.bias === "bullish" ? "▲" : n.bias === "bearish" ? "▼" : "—"}</span>
                  </div>
                  <div className="ns">{n.summary}</div>
                </div>;
              })}</div>
            </div>
          )}

          {data.events && data.events.length > 0 && (
            <div>
              <div className="st"><span style={{ color: "var(--pk)" }}>●</span> CALENDRIER ÉCO</div>
              <div className="eg">{data.events.map(function (e, i) {
                return <div key={i} className="ec fade" style={{ animationDelay: i * 30 + "ms" }}>
                  <div className="et"><span className="en">{e.name}</span><span className="ed">{e.date}</span></div>
                  {e.consensus && <div className="er">Consensus: <span>{e.consensus}</span></div>}
                  {e.if_above && <div className="ea bu">📈 {e.if_above}</div>}
                  {e.if_below && <div className="ea be">📉 {e.if_below}</div>}
                </div>;
              })}</div>
            </div>
          )}
        </div>
      )}

      <footer className="ft"><span>FLOW BRIEFING · NQ SCALPER</span><span>Haiku 4.5 + Web Search</span></footer>
    </div>
  );
}

var CSS = "\n@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');\n:root{--bg:#07080c;--b2:#0c0e14;--b3:#12151e;--bd:#1a1e2e;--bd2:#252a3a;--tx:#c4c8d4;--t2:#6b7084;--t3:#3d4156;--c:#00d4ff;--g:#00e676;--r:#ff5252;--o:#ffa726;--pk:#f472b6;--m:'IBM Plex Mono',monospace;--s:'DM Sans',sans-serif}\n*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg)}\n.root{font-family:var(--s);background:var(--bg);color:var(--tx);min-height:100vh}\n.hdr{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid var(--bd);background:rgba(7,8,12,.95);backdrop-filter:blur(12px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}\n.logo{display:flex;align-items:center;gap:12px}.lm{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,rgba(0,212,255,.15),rgba(0,212,255,.05));border:1px solid rgba(0,212,255,.25);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--c)}.lt{font-family:var(--m);font-size:13px;font-weight:600;color:#fff;letter-spacing:2px}.ls{font-size:10px;color:var(--t3)}\n.acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tb{font-family:var(--m);font-size:10px;color:var(--t3)}\n.btn{font-family:var(--m);font-size:11px;padding:7px 16px;border-radius:5px;cursor:pointer;transition:all .15s;border:none}\n.bp{background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.25);color:var(--c)}.bp:hover{background:rgba(0,212,255,.18)}.bp:disabled{opacity:.4;cursor:default}\n.bg{background:transparent;border:1px solid var(--bd);color:var(--t2);padding:7px 10px}\n.bd{background:rgba(88,101,242,.12);border:1px solid rgba(88,101,242,.3);color:#7289da}\n.prog{padding:10px 24px;font-family:var(--m);font-size:11px;color:var(--c);background:rgba(0,212,255,.03);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px}\n@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}.dot{animation:blink 1s infinite;font-size:8px}\n.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:40px}.empty h2{font-family:var(--m);font-size:18px;color:#fff;letter-spacing:1.5px;margin-bottom:8px}.empty p{font-size:13px;color:var(--t3);max-width:400px;line-height:1.6;margin-bottom:20px}\n.sp{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:24px}.sc{font-family:var(--m);font-size:10px;padding:4px 10px;border:1px solid;border-radius:4px;display:flex;gap:6px}\n.bs{font-family:var(--m);font-size:14px;font-weight:600;padding:14px 40px;border-radius:8px;cursor:pointer;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.04));border:1px solid rgba(0,212,255,.3);color:var(--c);letter-spacing:1px;transition:all .2s}.bs:hover{transform:scale(1.02);box-shadow:0 0 30px rgba(0,212,255,.15)}\n.err{margin:24px;padding:16px;background:rgba(255,82,82,.06);border:1px solid rgba(255,82,82,.15);border-radius:8px;color:var(--r);font-size:12px;text-align:center}\n@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.sk{background:linear-gradient(90deg,var(--b2) 25%,var(--b3) 50%,var(--b2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px}\n.ct{padding:16px 24px 40px;max-width:1200px;margin:0 auto}\n.sb{display:flex;gap:4px;margin-bottom:16px;overflow-x:auto}.si{flex:1;min-width:80px;background:var(--b2);border:1px solid var(--bd);border-radius:6px;padding:6px 8px;text-align:center}.sd{width:6px;height:6px;border-radius:50%;margin:0 auto 3px}.sn{font-size:8px;color:var(--t2)}.stm{font-family:var(--m);font-size:8px;color:var(--t3)}.slb{font-family:var(--m);font-size:9px;font-weight:600;margin-top:1px}\n.vc{background:var(--b2);border:1px solid var(--bd);border-radius:10px;padding:20px 24px;margin-bottom:16px;position:relative;overflow:hidden}.vc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.vc.bull::before{background:linear-gradient(90deg,transparent,var(--g),transparent)}.vc.bear::before{background:linear-gradient(90deg,transparent,var(--r),transparent)}.vc.neu::before{background:linear-gradient(90deg,transparent,var(--o),transparent)}\n.vh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:10px}.vb{font-family:var(--m);font-size:20px;font-weight:700;letter-spacing:2px}.vcf{font-family:var(--m);font-size:10px;padding:3px 10px;border-radius:4px;font-weight:600;border:1px solid rgba(255,255,255,.1)}.vs{font-size:13px;line-height:1.7;margin-bottom:14px}.vl{font-family:var(--m);font-size:11px;color:var(--c);background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.1);border-radius:6px;padding:10px 14px;margin-bottom:14px}\n.scs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.scn{background:rgba(255,255,255,.015);border:1px solid var(--bd);border-radius:8px;padding:12px}.sch{display:flex;justify-content:space-between;font-family:var(--m);font-size:11px;margin-bottom:6px}.sct{font-size:10px;color:var(--t2);margin-bottom:3px}.scta{font-family:var(--m);font-size:10px;color:var(--c)}\n.ib{background:var(--b2);border:1px solid var(--bd);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:12px}.ib p{font-size:11px;line-height:1.5;color:var(--t2)}.cy{border-left:2px solid var(--c)}.og{border-left:2px solid var(--o)}\n.pl{font-family:var(--m);font-size:9px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:6px}\n.st{font-family:var(--m);font-size:10px;font-weight:600;color:var(--t3);letter-spacing:2px;margin:16px 0 10px;display:flex;align-items:center;gap:8px}\n.mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;margin-bottom:16px}\n.mc{background:var(--b2);border:1px solid var(--bd);border-radius:6px;padding:10px 12px}.mt{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}.mn{font-family:var(--m);font-size:10px;font-weight:600;color:#fff}.mp{font-family:var(--m);font-size:11px;font-weight:700}.mpx{font-family:var(--m);font-size:16px;font-weight:700;color:#fff}\n.nl{display:flex;flex-direction:column;gap:3px;margin-bottom:16px}\n.ni{padding:10px 14px;background:var(--b2);border-left:2px solid var(--bd);border-radius:0 6px 6px 0}\n.nh{display:flex;align-items:center;gap:8px;margin-bottom:4px}.it{font-family:var(--m);font-size:8px;font-weight:700;flex-shrink:0}.nt{font-size:12px;font-weight:500;color:#ddd;flex:1}.nb{font-family:var(--m);font-size:10px;font-weight:700}\n.ns{font-size:11px;color:var(--t2);line-height:1.4}\n.eg{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;margin-bottom:16px}\n.ec{background:var(--b2);border:1px solid var(--bd);border-radius:8px;padding:12px}.et{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.en{font-size:13px;font-weight:600;color:#ddd}.ed{font-family:var(--m);font-size:10px;color:var(--t3)}.er{font-family:var(--m);font-size:10px;color:var(--t2);margin-bottom:4px}.er span{color:var(--tx)}\n.ea{font-size:10px;padding:4px 8px;border-radius:4px;margin-bottom:3px;line-height:1.4}.bu{background:rgba(0,230,118,.06);color:var(--g)}.be{background:rgba(255,82,82,.06);color:var(--r)}\n@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeUp .25s ease both}\n.mo{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;display:flex;align-items:center;justify-content:center}.md{background:var(--b2);border:1px solid var(--bd2);border-radius:12px;padding:28px;width:400px;max-width:90vw}.md h3{font-family:var(--m);font-size:13px;color:#fff;margin-bottom:16px}.md label{font-size:11px;color:var(--t2);display:block;margin-bottom:6px}.mi{width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-family:var(--m);font-size:11px;outline:none;margin-bottom:16px}.ma{display:flex;justify-content:flex-end;gap:8px}\n.ft{padding:14px 24px;border-top:1px solid var(--bd);display:flex;justify-content:space-between;font-family:var(--m);font-size:9px;color:var(--t3)}\n.toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;font-family:var(--m);font-size:11px;z-index:200;animation:fadeUp .3s ease}.sending{background:rgba(88,101,242,.2);color:#7289da}.sent{background:rgba(0,230,118,.15);color:var(--g)}.error{background:rgba(255,82,82,.12);color:var(--r)}\n@media(max-width:768px){.scs{grid-template-columns:1fr}.mg{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.ct{padding:12px}.sb{flex-wrap:wrap}}\n::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}\n";
