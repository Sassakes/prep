import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════
   PROMPT — Claude analyse les NEWS uniquement
   Les prix live viennent de TradingView
   ═══════════════════════════════════════════ */

var SYSTEM_PROMPT =
  "Tu es un analyste macro senior dans un prop trading desk." +
  " Tu prépares le morning briefing pour un scalper NQ futures." +
  "\n\nDATE IMPORTANTE: Nous sommes en MARS 2026. Tes données d'entraînement peuvent être obsolètes." +
  " Base-toi UNIQUEMENT sur les titres RSS fournis ci-dessous pour ton analyse." +
  "\n\n⚠️ INTERDIT de donner des prix spécifiques d'instruments (NQ, ES, Gold, etc)." +
  " Les prix live sont affichés séparément via TradingView." +
  " Concentre-toi sur: contexte macro, analyse des news, scénarios, flux, corrélations." +
  "\n\nRÈGLE: Réponds UNIQUEMENT en JSON valide. Aucun texte hors JSON." +
  "\n\nStructure:" +
  '\n{' +
  '\n  "verdict": {' +
  '\n    "bias": "BULLISH ou BEARISH ou NEUTRE",' +
  '\n    "confidence": "HIGH ou MEDIUM ou LOW",' +
  '\n    "title": "Contexte dominant en 5-8 mots",' +
  '\n    "summary": "Analyse macro 4-6 phrases: contexte, catalysts, positionnement NQ. PAS DE PRIX.",' +
  '\n    "bull_case": "Scénario haussier: trigger + description. PAS DE TARGET PRIX.",' +
  '\n    "bear_case": "Scénario baissier: trigger + description. PAS DE TARGET PRIX."' +
  '\n  },' +
  '\n  "flows": "Flux institutionnels 3 phrases: equity/bonds/commodities direction, rotation, risk-on/off.",' +
  '\n  "intermarket": "Corrélations 2-3 phrases: DXY impact, yields, oil, gold, VIX. Basé sur les news.",' +
  '\n  "session_plan": "Plan session 3 phrases: London 09:00, US data 14:30, US Open 15:30 CET. Quoi surveiller.",' +
  '\n  "week_summary": "Résumé de la semaine en cours basé sur les news: événements clés, tendance dominante, 3-4 phrases.",' +
  '\n  "news": [' +
  '\n    {"title": "Titre clair", "impact": "HIGH ou MEDIUM", "bias": "BULL ou BEAR ou NEUTRE", "detail": "Impact sur NQ/ES 1-2 phrases"}' +
  '\n  ]' +
  '\n}' +
  "\n\nMinimum 6 news. Analyse contextuelle uniquement — PAS de chiffres inventés.";

/* ═══════════════════════════════════════════
   SESSIONS
   ═══════════════════════════════════════════ */

function getSessions() {
  var now = new Date();
  var cet;
  try { cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" })); } catch (e) { cet = now; }
  var t = cet.getHours() * 60 + cet.getMinutes();
  var list = [
    { name: "London Open", mins: 540 },
    { name: "EU Close", mins: 840 },
    { name: "US Pre-Mkt", mins: 870 },
    { name: "US Open", mins: 930 },
    { name: "Power Hour", mins: 1260 },
    { name: "US Close", mins: 1320 }
  ];
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i].mins - t;
    var st = d < -30 ? "done" : d < 0 ? "live" : d < 60 ? "soon" : "wait";
    var lb = st === "done" ? "" : st === "live" ? "LIVE" : st === "soon" ? d + "min" : Math.floor(d / 60) + "h" + String(d % 60).padStart(2, "0");
    var hh = Math.floor(list[i].mins / 60);
    var mm = list[i].mins % 60;
    result.push({ name: list[i].name, st: st, lb: lb, tm: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") });
  }
  return result;
}

function safeJSON(str) {
  var c = str.replace(/```json/g, "").replace(/```/g, "").trim();
  var m = c.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) {
    try { return JSON.parse(m[0].replace(/,(\s*[}\]])/g, "$1")); } catch (e2) { return null; }
  }
}

/* ═══ TradingView Widget ═══ */
function TVWidget(props) {
  var ref = useRef(null);
  useEffect(function () {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    var d = document.createElement("div");
    d.className = "tradingview-widget-container__widget";
    ref.current.appendChild(d);
    var s = document.createElement("script");
    s.type = "text/javascript";
    s.src = props.src;
    s.async = true;
    s.textContent = JSON.stringify(props.config);
    ref.current.appendChild(s);
  }, []);
  return <div ref={ref} className="tradingview-widget-container" />;
}

/* ═══ Discord ═══ */
function buildDiscord(data) {
  if (!data || !data.verdict) return null;
  var v = data.verdict;
  var col = v.bias === "BULLISH" ? 0x00e676 : v.bias === "BEARISH" ? 0xff5252 : 0xffa726;
  var em = v.bias === "BULLISH" ? "🟢" : v.bias === "BEARISH" ? "🔴" : "🟡";
  var nws = (data.news || []).slice(0, 8).map(function (n) {
    var ic = n.bias === "BULL" ? "🟢" : n.bias === "BEAR" ? "🔴" : "⚪";
    return ic + " **[" + n.impact + "]** " + n.title + "\n" + (n.detail || "");
  }).join("\n\n");
  var dt = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return {
    content: "# ⚡ FLOW BRIEFING — " + dt.toUpperCase(),
    embeds: [
      { title: em + " " + v.bias + " (" + v.confidence + ")", description: "**" + (v.title || "") + "**\n\n" + (v.summary || "").slice(0, 900), color: col },
      { title: "🎯 Scénarios", description: ("**▲ BULL:** " + (v.bull_case || "—") + "\n\n**▼ BEAR:** " + (v.bear_case || "—")).slice(0, 1024), color: col },
      { title: "💰 Flux", description: (data.flows || "—").slice(0, 1024), color: 0x00d4ff },
      { title: "🔗 Intermarché", description: (data.intermarket || "—").slice(0, 1024), color: 0xffa726 },
      { title: "📋 Semaine", description: (data.week_summary || "—").slice(0, 1024), color: 0x34d399 },
      { title: "📅 Plan Session", description: (data.session_plan || "—").slice(0, 1024), color: 0xf472b6 },
      { title: "⚠️ News", description: (nws || "—").slice(0, 1024), color: 0xff4444 }
    ]
  };
}

/* ═══════════════════════════════════════════
   APP
   ═══════════════════════════════════════════ */

export default function App() {
  var _d = useState(null); var data = _d[0]; var setData = _d[1];
  var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
  var _e = useState(null); var error = _e[0]; var setError = _e[1];
  var _r = useState(null); var refreshed = _r[0]; var setRefreshed = _r[1];
  var _s = useState(getSessions()); var sess = _s[0]; var setSess = _s[1];
  var _sh = useState(false); var showSet = _sh[0]; var setShowSet = _sh[1];
  var _wh = useState(""); var webhook = _wh[0]; var setWebhook = _wh[1];
  var _tw = useState(""); var tmpWh = _tw[0]; var setTmpWh = _tw[1];
  var _ds = useState(null); var dSt = _ds[0]; var setDSt = _ds[1];
  var _st = useState(""); var step = _st[0]; var setStep = _st[1];

  useEffect(function () {
    try { setWebhook(localStorage.getItem("fb_wh") || ""); } catch (e) {}
    var t = setInterval(function () { setSess(getSessions()); }, 60000);
    return function () { clearInterval(t); };
  }, []);

  var saveWh = function () {
    setWebhook(tmpWh);
    try { localStorage.setItem("fb_wh", tmpWh); } catch (e) {}
    setShowSet(false);
  };

  var sendDiscord = async function (d2) {
    var url = ""; try { url = localStorage.getItem("fb_wh") || webhook; } catch (e) { url = webhook; }
    if (!url) return;
    setDSt("sending");
    try {
      var p = buildDiscord(d2 || data);
      if (!p) throw new Error("No data");
      var r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (!r.ok) throw new Error("" + r.status);
      setDSt("sent");
    } catch (e) { setDSt("error"); }
    setTimeout(function () { setDSt(null); }, 3000);
  };

  var scan = useCallback(async function () {
    setLoading(true); setError(null); setData(null);
    setStep("Récupération des flux RSS Investing.com + analyse...");
    var now = new Date();
    var ds = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var ts = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    try {
      var resp = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: "Nous sommes le " + ds + ", il est " + ts + " CET (mars 2026). Prépare le morning briefing institutionnel. Analyse les titres RSS ci-dessous. NE DONNE AUCUN PRIX d'instrument." }]
        })
      });
      if (!resp.ok) {
        var et = ""; try { et = await resp.text(); } catch (x) {}
        throw new Error("Serveur " + resp.status + ": " + et.slice(0, 150));
      }
      var txt = await resp.text();
      var result; try { result = JSON.parse(txt); } catch (pe) { throw new Error("Réponse non-JSON"); }
      if (result.error) throw new Error(typeof result.error === "string" ? result.error : result.error.message || "Erreur API");
      var full = "";
      var blocks = result.content || [];
      for (var i = 0; i < blocks.length; i++) { if (blocks[i].type === "text" && blocks[i].text) full += blocks[i].text; }
      if (!full) throw new Error("Réponse vide");
      var parsed = safeJSON(full);
      if (!parsed) throw new Error("JSON invalide");
      setData(parsed); setRefreshed(new Date()); setSess(getSessions());
      try { var h = localStorage.getItem("fb_wh"); if (h) setTimeout(function () { sendDiscord(parsed); }, 500); } catch (ae) {}
    } catch (e) { setError(e.message || "Erreur"); }
    setLoading(false); setStep("");
  }, []);

  var sc = function (s) { return s === "live" ? "#00e676" : s === "soon" ? "#ffa726" : s === "done" ? "#222" : "#444"; };

  return (
    <div className="root">
      <style>{STYLES}</style>

      {/* TRADINGVIEW TICKER — symboles gratuits */}
      <div className="tv-tape">
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
          config={{
            symbols: [
              { description: "Nasdaq 100", proName: "NASDAQ:NDX" },
              { description: "S&P 500", proName: "FOREXCOM:SPXUSD" },
              { description: "Russell 2000", proName: "FOREXCOM:RUSSELLUSD" },
              { description: "VIX", proName: "CBOE:VIX" },
              { description: "Dollar Index", proName: "TVC:DXY" },
              { description: "WTI Crude", proName: "TVC:USOIL" },
              { description: "Gold", proName: "TVC:GOLD" },
              { description: "EUR/USD", proName: "FX:EURUSD" },
              { description: "US 10Y", proName: "TVC:US10Y" },
              { description: "Bitcoin", proName: "BITSTAMP:BTCUSD" }
            ],
            showSymbolLogo: true,
            isTransparent: true,
            displayMode: "adaptive",
            colorTheme: "dark",
            locale: "fr"
          }}
        />
      </div>

      {/* HEADER */}
      <header className="hdr">
        <div className="logo">
          <div className="lm">⚡</div>
          <div><div className="lt">FLOW BRIEFING</div><div className="ls">Institutional Morning Desk</div></div>
        </div>
        <div className="acts">
          {refreshed && <span className="tb">{refreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
          {data && webhook && <button className="btn bd" onClick={function () { sendDiscord(null); }}>{dSt === "sending" ? "◌" : "📨"}</button>}
          <button className="btn bg" onClick={function () { setTmpWh(webhook); setShowSet(true); }}>⚙</button>
          <button className="btn bp" onClick={scan} disabled={loading}>{loading ? "◌ Analyse..." : "↻ Briefing"}</button>
        </div>
      </header>

      {step && <div className="prog"><span className="dot">●</span> {step}</div>}

      {showSet && (
        <div className="mo" onClick={function () { setShowSet(false); }}>
          <div className="mdl" onClick={function (e) { e.stopPropagation(); }}>
            <h3 className="mhd">⚙ Paramètres</h3>
            <label className="mlb">Webhook Discord (envoi auto à chaque scan)</label>
            <input className="mi" value={tmpWh} onChange={function (e) { setTmpWh(e.target.value); }} placeholder="https://discord.com/api/webhooks/..." />
            <div className="mact"><button className="btn bg" onClick={function () { setShowSet(false); }}>Annuler</button><button className="btn bp" onClick={saveWh}>OK</button></div>
          </div>
        </div>
      )}

      {dSt && <div className={"toast " + dSt}>{dSt === "sending" ? "📨 Envoi..." : dSt === "sent" ? "✓ Envoyé" : "✗ Erreur webhook"}</div>}

      {/* EMPTY */}
      {!data && !loading && !error && (
        <div className="empty">
          <div className="ei">⚡</div>
          <h2 className="eh">MORNING BRIEFING</h2>
          <p className="ep">Prix live TradingView + News RSS Investing.com + Analyse IA.<br />~10s · ~$0.005/scan · 7 flux RSS</p>
          <div className="sp">{sess.filter(function (s) { return s.st !== "done"; }).slice(0, 4).map(function (s, i) {
            return <div key={i} className="schip" style={{ borderColor: sc(s.st), color: sc(s.st) }}>{s.name} <b>{s.lb}</b></div>;
          })}</div>
          <button className="bs" onClick={scan}>Lancer le briefing</button>
        </div>
      )}

      {error && !loading && <div className="err">⚠ {error}<br /><button className="btn bp" onClick={scan} style={{ marginTop: 12 }}>Réessayer</button></div>}

      {loading && !data && (
        <div className="ct">
          <div className="sk" style={{ height: 120, marginBottom: 14 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}><div className="sk" style={{ height: 70 }} /><div className="sk" style={{ height: 70 }} /></div>
          <div className="sk" style={{ height: 50, marginBottom: 6 }} />
          <div className="sk" style={{ height: 50, marginBottom: 6 }} />
          <div className="sk" style={{ height: 50, marginBottom: 6 }} />
        </div>
      )}

      {/* ═══ DATA ═══ */}
      {data && (
        <div className="ct">

          {/* Sessions */}
          <div className="sb">{sess.map(function (s, i) {
            return <div key={i} className="si" style={{ opacity: s.st === "done" ? 0.25 : 1 }}>
              <div className="sd" style={{ background: sc(s.st) }} />
              <div className="sn">{s.name}</div>
              <div className="stm">{s.tm} CET</div>
              <div className="slb" style={{ color: sc(s.st) }}>{s.lb}</div>
            </div>;
          })}</div>

          {/* Verdict */}
          {data.verdict && (
            <div className={"vc fade " + (data.verdict.bias === "BULLISH" ? "bull" : data.verdict.bias === "BEARISH" ? "bear" : "neu")}>
              <div className="vh">
                <div>
                  <div className="vbias" style={{ color: data.verdict.bias === "BULLISH" ? "#00e676" : data.verdict.bias === "BEARISH" ? "#ff5252" : "#ffa726" }}>
                    {data.verdict.bias === "BULLISH" ? "▲" : data.verdict.bias === "BEARISH" ? "▼" : "◆"} {data.verdict.bias}
                  </div>
                  {data.verdict.title && <div className="vtit">{data.verdict.title}</div>}
                </div>
                <div className="vconf" style={{ color: data.verdict.confidence === "HIGH" ? "#00e676" : "#ffa726", borderColor: data.verdict.confidence === "HIGH" ? "rgba(0,230,118,.3)" : "rgba(255,167,38,.3)" }}>{data.verdict.confidence}</div>
              </div>
              <p className="vsum">{data.verdict.summary}</p>
              {(data.verdict.bull_case || data.verdict.bear_case) && (
                <div className="vscs">
                  <div className="vsc"><div className="vscl" style={{ color: "#00e676" }}>▲ BULL CASE</div><div className="vsct">{data.verdict.bull_case || "—"}</div></div>
                  <div className="vsc"><div className="vscl" style={{ color: "#ff5252" }}>▼ BEAR CASE</div><div className="vsct">{data.verdict.bear_case || "—"}</div></div>
                </div>
              )}
            </div>
          )}

          {/* Week summary */}
          {data.week_summary && (
            <div className="abox fade ab-green"><div className="alab">📋 RÉSUMÉ SEMAINE</div><p className="atxt">{data.week_summary}</p></div>
          )}

          {/* Analysis */}
          <div className="arow">
            {data.flows && <div className="abox fade ab-cyan"><div className="alab">💰 FLUX INSTITUTIONNELS</div><p className="atxt">{data.flows}</p></div>}
            {data.intermarket && <div className="abox fade ab-orange"><div className="alab">🔗 INTERMARCHÉ</div><p className="atxt">{data.intermarket}</p></div>}
          </div>

          {data.session_plan && <div className="abox fade ab-pink"><div className="alab">📅 PLAN DE SESSION</div><p className="atxt">{data.session_plan}</p></div>}

          {/* News */}
          {data.news && data.news.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="sec">⚠ NEWS ({data.news.length})</div>
              <div className="nl">{data.news.map(function (n, i) {
                var impC = n.impact === "HIGH" ? "#ff5252" : "#ffa726";
                var biasC = n.bias === "BULL" ? "#00e676" : n.bias === "BEAR" ? "#ff5252" : "#78909c";
                return (
                  <div key={i} className="ni fade" style={{ borderLeftColor: impC, animationDelay: i * 40 + "ms" }}>
                    <div className="nh">
                      <span className="nimp" style={{ color: impC }}>{n.impact}</span>
                      <span className="nti">{n.title}</span>
                      <span className="nbias" style={{ color: biasC }}>{n.bias === "BULL" ? "▲" : n.bias === "BEAR" ? "▼" : "—"} {n.bias}</span>
                    </div>
                    <div className="ndet">{n.detail}</div>
                  </div>
                );
              })}</div>
            </div>
          )}

          {/* TradingView Economic Calendar */}
          <div style={{ marginTop: 24 }}>
            <div className="sec">📅 CALENDRIER ÉCONOMIQUE</div>
            <div className="tv-cal">
              <TVWidget
                src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
                config={{ colorTheme: "dark", isTransparent: true, width: "100%", height: "400", locale: "fr", importanceFilter: "0,1", countryFilter: "us,eu,gb,jp" }}
              />
            </div>
          </div>
        </div>
      )}

      <footer className="ft"><span>FLOW BRIEFING · Institutional NQ Desk</span><span>TradingView · Investing.com RSS · Claude Haiku</span></footer>
    </div>
  );
}

/* ═══ STYLES ═══ */
var STYLES = [
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700;800&display=swap');",
  ":root{--m:'IBM Plex Mono',monospace;--s:'DM Sans',sans-serif;--bg:#060810;--bg2:#0a0d15;--bg3:#10131d;--bd:#161a28;--bd2:#1e2336;--tx:#c8ccd8;--t2:#687088;--t3:#3a3f54;--c:#00d4ff;--g:#00e676;--r:#ff5252;--o:#ffa726;--pk:#f472b6;--gn:#34d399}",
  "*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);font-family:var(--s)}",
  ".root{background:var(--bg);color:var(--tx);min-height:100vh}",
  ".tv-tape{border-bottom:1px solid var(--bd);overflow:hidden}.tv-tape .tradingview-widget-copyright{display:none!important}",
  ".hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 28px;border-bottom:1px solid var(--bd);background:rgba(6,8,16,.92);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}",
  ".logo{display:flex;align-items:center;gap:14px}.lm{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.03));border:1px solid rgba(0,212,255,.2);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--c)}.lt{font-family:var(--m);font-size:14px;font-weight:700;color:#fff;letter-spacing:2.5px}.ls{font-size:10px;color:var(--t3);letter-spacing:.5px;margin-top:1px}",
  ".acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tb{font-family:var(--m);font-size:10px;color:var(--t3)}",
  ".btn{font-family:var(--m);font-size:11px;font-weight:500;padding:7px 18px;border-radius:6px;cursor:pointer;transition:all .15s;border:none;letter-spacing:.3px}",
  ".bp{background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);color:var(--c)}.bp:hover{background:rgba(0,212,255,.15);transform:translateY(-1px)}.bp:disabled{opacity:.4;cursor:default;transform:none}",
  ".bg{background:transparent;border:1px solid var(--bd);color:var(--t2);padding:7px 12px}.bg:hover{border-color:var(--bd2);color:var(--tx)}",
  ".bd{background:rgba(88,101,242,.1);border:1px solid rgba(88,101,242,.25);color:#7289da;padding:7px 12px}",
  ".prog{padding:10px 28px;font-family:var(--m);font-size:11px;color:var(--c);background:rgba(0,212,255,.02);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px}",
  "@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}.dot{animation:blink 1s infinite;font-size:8px}",
  ".empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:65vh;text-align:center;padding:48px 24px}.ei{font-size:44px;opacity:.12;margin-bottom:28px}.eh{font-family:var(--m);font-size:20px;color:#fff;letter-spacing:2px;margin-bottom:10px;font-weight:700}.ep{font-size:13px;color:var(--t3);max-width:420px;line-height:1.7;margin-bottom:24px}",
  ".sp{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:28px}.schip{font-family:var(--m);font-size:10px;padding:5px 12px;border:1px solid;border-radius:5px;display:flex;gap:6px}",
  ".bs{font-family:var(--m);font-size:14px;font-weight:600;padding:14px 44px;border-radius:8px;cursor:pointer;background:linear-gradient(135deg,rgba(0,212,255,.1),rgba(0,212,255,.03));border:1px solid rgba(0,212,255,.25);color:var(--c);letter-spacing:1.5px;transition:all .2s}.bs:hover{transform:scale(1.03);box-shadow:0 0 40px rgba(0,212,255,.12)}",
  ".err{margin:24px 28px;padding:20px;background:rgba(255,82,82,.05);border:1px solid rgba(255,82,82,.12);border-radius:10px;color:var(--r);font-size:12px;text-align:center;line-height:1.6}",
  "@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.sk{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}",
  ".ct{padding:20px 28px 48px;max-width:1200px;margin:0 auto}",
  ".sb{display:flex;gap:5px;margin-bottom:20px;overflow-x:auto;padding-bottom:2px}.si{flex:1;min-width:85px;background:var(--bg2);border:1px solid var(--bd);border-radius:7px;padding:8px 10px;text-align:center}.sd{width:7px;height:7px;border-radius:50%;margin:0 auto 4px}.sn{font-size:9px;color:var(--t2);font-weight:500;letter-spacing:.3px}.stm{font-family:var(--m);font-size:8px;color:var(--t3);margin-top:1px}.slb{font-family:var(--m);font-size:10px;font-weight:700;margin-top:3px}",
  ".vc{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden}.vc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.vc.bull::before{background:linear-gradient(90deg,transparent,var(--g),transparent)}.vc.bear::before{background:linear-gradient(90deg,transparent,var(--r),transparent)}.vc.neu::before{background:linear-gradient(90deg,transparent,var(--o),transparent)}",
  ".vh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px}.vbias{font-family:var(--m);font-size:22px;font-weight:700;letter-spacing:3px}.vtit{font-size:14px;color:var(--t2);margin-top:4px;font-weight:500;font-style:italic}.vconf{font-family:var(--m);font-size:11px;padding:4px 14px;border-radius:5px;font-weight:600;border:1px solid}",
  ".vsum{font-size:14px;line-height:1.8;margin-bottom:16px;color:#dde}",
  ".vscs{display:grid;grid-template-columns:1fr 1fr;gap:12px}.vsc{background:rgba(255,255,255,.012);border:1px solid var(--bd);border-radius:8px;padding:14px 16px}.vscl{font-family:var(--m);font-size:11px;font-weight:700;margin-bottom:8px;letter-spacing:.5px}.vsct{font-size:12px;color:var(--t2);line-height:1.6}",
  ".arow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}",
  ".abox{background:var(--bg2);border:1px solid var(--bd);border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:12px}.ab-cyan{border-left:2px solid var(--c)}.ab-orange{border-left:2px solid var(--o)}.ab-pink{border-left:2px solid var(--pk)}.ab-green{border-left:2px solid var(--gn)}",
  ".alab{font-family:var(--m);font-size:10px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:8px}.atxt{font-size:12px;line-height:1.7;color:var(--t2)}",
  ".sec{font-family:var(--m);font-size:11px;font-weight:600;color:var(--t3);letter-spacing:2px;margin:20px 0 12px;display:flex;align-items:center;gap:8px}",
  ".nl{display:flex;flex-direction:column;gap:4px}.ni{padding:12px 16px;background:var(--bg2);border-left:3px solid var(--bd);border-radius:0 8px 8px 0;transition:all .12s}.ni:hover{background:var(--bg3);transform:translateX(3px)}",
  ".nh{display:flex;align-items:center;gap:10px;margin-bottom:6px}.nimp{font-family:var(--m);font-size:9px;font-weight:700;letter-spacing:.5px;flex-shrink:0}.nti{font-size:13px;font-weight:600;color:#eee;flex:1}.nbias{font-family:var(--m);font-size:10px;font-weight:700;flex-shrink:0}.ndet{font-size:11px;color:var(--t2);line-height:1.5}",
  ".tv-cal{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;overflow:hidden;min-height:400px}.tv-cal .tradingview-widget-copyright{display:none!important}",
  "@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeUp .3s ease both}",
  ".mo{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center}.mdl{background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;padding:32px;width:440px;max-width:90vw}.mhd{font-family:var(--m);font-size:14px;color:#fff;margin-bottom:20px;letter-spacing:.5px}.mlb{font-size:11px;color:var(--t2);display:block;margin-bottom:8px}.mi{width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--bd);border-radius:7px;color:var(--tx);font-family:var(--m);font-size:11px;outline:none;margin-bottom:16px}.mi:focus{border-color:var(--bd2)}.mact{display:flex;justify-content:flex-end;gap:10px}",
  ".ft{padding:16px 28px;border-top:1px solid var(--bd);display:flex;justify-content:space-between;font-family:var(--m);font-size:9px;color:var(--t3);letter-spacing:.5px}",
  ".toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-family:var(--m);font-size:11px;z-index:200;animation:fadeUp .3s ease;border:1px solid}.sending{background:rgba(88,101,242,.15);border-color:rgba(88,101,242,.3);color:#7289da}.sent{background:rgba(0,230,118,.1);border-color:rgba(0,230,118,.2);color:var(--g)}.error{background:rgba(255,82,82,.08);border-color:rgba(255,82,82,.15);color:var(--r)}",
  "@media(max-width:768px){.vscs{grid-template-columns:1fr}.arow{grid-template-columns:1fr}.ct{padding:16px}.sb{flex-wrap:wrap}}",
  "::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}"
].join("\n");
