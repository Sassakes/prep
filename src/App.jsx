import { useState, useEffect, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════
   SYSTEM PROMPT — Claude analyse les NEWS, pas les prix
   TradingView gère les prix en temps réel
   ═══════════════════════════════════════════ */

var SYSTEM_PROMPT =
  "Tu es un analyste macro senior dans un bureau de trading institutionnel." +
  " Tu prépares le morning briefing pour un scalper NQ (Nasdaq futures)." +
  "\n\nRÈGLE ABSOLUE: Réponds UNIQUEMENT en JSON valide. Aucun texte hors JSON." +
  "\n\nNE DONNE PAS de prix des instruments — les prix live sont affichés séparément." +
  " Concentre-toi sur l'ANALYSE, le CONTEXTE et les SCÉNARIOS." +
  "\n\nStructure JSON:" +
  '\n{' +
  '\n  "verdict": {' +
  '\n    "bias": "BULLISH ou BEARISH ou NEUTRE",' +
  '\n    "confidence": "HIGH ou MEDIUM ou LOW",' +
  '\n    "title": "Titre du contexte en 5-8 mots",' +
  '\n    "summary": "Analyse macro en 4-6 phrases claires et structurées. Contexte dominant, catalysts, positionnement recommandé pour NQ.",' +
  '\n    "key_levels": "Résistances et supports NQ avec contexte. Ex: R1 24500 (high semaine) R2 24800 (ATH) S1 24100 (POC) S2 23800 (gap)",' +
  '\n    "bull_case": "Scénario haussier: trigger + target + probabilité en 2 phrases",' +
  '\n    "bear_case": "Scénario baissier: trigger + target + probabilité en 2 phrases"' +
  '\n  },' +
  '\n  "flows": "Analyse des flux institutionnels en 3 phrases: direction equity/bonds/commodities, rotation sectorielle, positionnement risk-on ou risk-off.",' +
  '\n  "intermarket": "Corrélations en 2-3 phrases: DXY impact, yields direction, oil/gold signal, VIX structure.",' +
  '\n  "session_plan": "Plan de session en 3 phrases: quoi surveiller à London, US pre-market, US open. Horaires CET des catalysts.",' +
  '\n  "news": [' +
  '\n    {"title": "Titre clair", "impact": "HIGH ou MEDIUM", "bias": "BULL ou BEAR ou NEUTRE", "detail": "Impact concret sur NQ/ES en 1-2 phrases"}' +
  '\n  ]' +
  '\n}' +
  "\n\nRègles:" +
  "\n- News: minimum 6, catégorise par impact (HIGH/MEDIUM)" +
  "\n- Verdict: ACTIONABLE avec niveaux NQ réalistes basés sur le contexte actuel" +
  "\n- Scénarios: donne des triggers précis (event, niveau, condition)" +
  "\n- Langage: professionnel, concis, institutionnel — pas de blabla" +
  "\n- JSON VALIDE: pas de virgule avant } ou ]";

/* ═══════════════════════════════════════════
   SESSION COUNTDOWN
   ═══════════════════════════════════════════ */

function getSessions() {
  var now = new Date();
  var cet;
  try {
    cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  } catch (e) {
    cet = now;
  }
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
    var lb = "";
    if (st === "done") lb = "";
    else if (st === "live") lb = "LIVE";
    else if (st === "soon") lb = d + "min";
    else lb = Math.floor(d / 60) + "h" + String(d % 60).padStart(2, "0");
    var hh = Math.floor(list[i].mins / 60);
    var mm = list[i].mins % 60;
    result.push({ name: list[i].name, st: st, lb: lb, tm: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") });
  }
  return result;
}

/* ═══════════════════════════════════════════
   SAFE JSON PARSER
   ═══════════════════════════════════════════ */

function safeJSON(str) {
  var c = str.replace(/```json/g, "").replace(/```/g, "").trim();
  var m = c.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) {
    try { return JSON.parse(m[0].replace(/,(\s*[}\]])/g, "$1")); } catch (e2) { return null; }
  }
}

/* ═══════════════════════════════════════════
   TRADINGVIEW WIDGET COMPONENT
   ═══════════════════════════════════════════ */

function TVWidget(props) {
  var ref = useRef(null);
  useEffect(function () {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    var widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    ref.current.appendChild(widgetDiv);
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = props.src;
    script.async = true;
    script.textContent = JSON.stringify(props.config);
    ref.current.appendChild(script);
    return function () {
      if (ref.current) ref.current.innerHTML = "";
    };
  }, []);
  return <div ref={ref} className="tradingview-widget-container" />;
}

/* ═══════════════════════════════════════════
   DISCORD
   ═══════════════════════════════════════════ */

function buildDiscord(data) {
  if (!data || !data.verdict) return null;
  var v = data.verdict;
  var col = v.bias === "BULLISH" ? 0x00e676 : v.bias === "BEARISH" ? 0xff5252 : 0xffa726;
  var em = v.bias === "BULLISH" ? "🟢" : v.bias === "BEARISH" ? "🔴" : "🟡";
  var nws = (data.news || []).slice(0, 6).map(function (n) {
    var ic = n.bias === "BULL" ? "🟢" : n.bias === "BEAR" ? "🔴" : "⚪";
    return ic + " **[" + n.impact + "]** " + n.title + "\n" + (n.detail || "");
  }).join("\n\n");
  var dt = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return {
    content: "# ⚡ FLOW BRIEFING — " + dt.toUpperCase(),
    embeds: [
      { title: em + " " + v.bias + " (" + v.confidence + ") — " + (v.title || ""), description: (v.summary || "").slice(0, 1024), color: col, fields: [{ name: "🎯 Niveaux NQ", value: (v.key_levels || "—").slice(0, 250), inline: false }] },
      { title: "🎯 Scénarios", description: ("**BULL:** " + (v.bull_case || "—") + "\n\n**BEAR:** " + (v.bear_case || "—")).slice(0, 1024), color: col },
      { title: "💰 Flux", description: (data.flows || "—").slice(0, 1024), color: 0x00d4ff },
      { title: "🔗 Intermarché", description: (data.intermarket || "—").slice(0, 1024), color: 0xffa726 },
      { title: "📅 Plan Session", description: (data.session_plan || "—").slice(0, 1024), color: 0xf472b6 },
      { title: "⚠️ News (" + (data.news || []).length + ")", description: (nws || "—").slice(0, 1024), color: 0xff4444 }
    ]
  };
}

/* ═══════════════════════════════════════════
   MAIN APP
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
    var url = "";
    try { url = localStorage.getItem("fb_wh") || webhook; } catch (e) { url = webhook; }
    if (!url) return;
    setDSt("sending");
    try {
      var p = buildDiscord(d2 || data);
      if (!p) throw new Error("No data");
      var r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      setDSt("sent");
    } catch (e) { setDSt("error"); }
    setTimeout(function () { setDSt(null); }, 3000);
  };

  var scan = useCallback(async function () {
    setLoading(true);
    setError(null);
    setData(null);
    setStep("Scan des news et analyse en cours...");
    var now = new Date();
    var ds = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var ts = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    try {
      var resp = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: ds + " " + ts + " CET. Prépare le morning briefing institutionnel pour la session NQ." }]
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
      setData(parsed);
      setRefreshed(new Date());
      setSess(getSessions());
      // Auto Discord
      try {
        var h = localStorage.getItem("fb_wh");
        if (h) setTimeout(function () { sendDiscord(parsed); }, 500);
      } catch (ae) {}
    } catch (e) { setError(e.message || "Erreur"); }
    setLoading(false);
    setStep("");
  }, []);

  var sc = function (s) { return s === "live" ? "#00e676" : s === "soon" ? "#ffa726" : s === "done" ? "#222" : "#444"; };

  /* ═══ RENDER ═══ */
  return (
    <div className="root">
      <style>{STYLES}</style>

      {/* ── TRADINGVIEW TICKER TAPE ── */}
      <div className="tv-ticker">
        <TVWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
          config={{
            symbols: [
              { description: "NQ", proName: "CME_MINI:NQ1!" },
              { description: "ES", proName: "CME_MINI:ES1!" },
              { description: "RTY", proName: "CME_MINI:RTY1!" },
              { description: "VIX", proName: "CBOE:VIX" },
              { description: "DXY", proName: "TVC:DXY" },
              { description: "WTI", proName: "NYMEX:CL1!" },
              { description: "Gold", proName: "COMEX:GC1!" },
              { description: "EUR/USD", proName: "FX:EURUSD" },
              { description: "10Y", proName: "TVC:US10Y" },
              { description: "BTC", proName: "BITSTAMP:BTCUSD" }
            ],
            showSymbolLogo: true,
            isTransparent: true,
            displayMode: "adaptive",
            colorTheme: "dark",
            locale: "fr"
          }}
        />
      </div>

      {/* ── HEADER ── */}
      <header className="hdr">
        <div className="logo">
          <div className="lm">⚡</div>
          <div>
            <div className="lt">FLOW BRIEFING</div>
            <div className="ls">Institutional Morning Briefing</div>
          </div>
        </div>
        <div className="acts">
          {refreshed && <span className="tb">MàJ {refreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
          {data && webhook && <button className="btn bd" onClick={function () { sendDiscord(null); }}>{dSt === "sending" ? "◌" : "📨"}</button>}
          <button className="btn bg" onClick={function () { setTmpWh(webhook); setShowSet(true); }}>⚙</button>
          <button className="btn bp" onClick={scan} disabled={loading}>{loading ? "◌ Analyse..." : "↻ Scanner"}</button>
        </div>
      </header>

      {/* ── PROGRESS ── */}
      {step && <div className="prog"><span className="dot">●</span> {step}</div>}

      {/* ── SETTINGS ── */}
      {showSet && (
        <div className="mo" onClick={function () { setShowSet(false); }}>
          <div className="md" onClick={function (e) { e.stopPropagation(); }}>
            <h3 className="mhd">⚙ Paramètres</h3>
            <label className="mlb">Webhook Discord (envoi auto à chaque scan)</label>
            <input className="mi" value={tmpWh} onChange={function (e) { setTmpWh(e.target.value); }} placeholder="https://discord.com/api/webhooks/..." />
            <div className="mact">
              <button className="btn bg" onClick={function () { setShowSet(false); }}>Annuler</button>
              <button className="btn bp" onClick={saveWh}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DISCORD TOAST ── */}
      {dSt && <div className={"toast " + dSt}>{dSt === "sending" ? "📨 Envoi Discord..." : dSt === "sent" ? "✓ Envoyé sur Discord" : "✗ Erreur webhook"}</div>}

      {/* ── EMPTY ── */}
      {!data && !loading && !error && (
        <div className="empty">
          <div className="ei">⚡</div>
          <h2 className="eh">MORNING BRIEFING</h2>
          <p className="ep">Prix live TradingView + Analyse IA des flux RSS.<br />~10 secondes, ~$0.005 par scan.</p>
          <div className="sp">{sess.filter(function (s) { return s.st !== "done"; }).slice(0, 4).map(function (s, i) {
            return <div key={i} className="sc" style={{ borderColor: sc(s.st), color: sc(s.st) }}>{s.name} <b>{s.lb}</b></div>;
          })}</div>
          <button className="bs" onClick={scan}>Lancer le briefing</button>
        </div>
      )}

      {/* ── ERROR ── */}
      {error && !loading && (
        <div className="err">⚠ {error}<br /><button className="btn bp" onClick={scan} style={{ marginTop: 12 }}>Réessayer</button></div>
      )}

      {/* ── LOADING ── */}
      {loading && !data && (
        <div className="ct">
          <div className="sk" style={{ height: 120, marginBottom: 16 }} />
          <div className="sk" style={{ height: 60, marginBottom: 8 }} />
          <div className="sk" style={{ height: 60, marginBottom: 8 }} />
          <div className="sk" style={{ height: 60, marginBottom: 8 }} />
        </div>
      )}

      {/* ═══ DATA ═══ */}
      {data && (
        <div className="ct">

          {/* SESSION TIMELINE */}
          <div className="sb">{sess.map(function (s, i) {
            return <div key={i} className="si" style={{ opacity: s.st === "done" ? 0.25 : 1 }}>
              <div className="sd" style={{ background: sc(s.st) }} />
              <div className="sn">{s.name}</div>
              <div className="stm">{s.tm} CET</div>
              <div className="slb" style={{ color: sc(s.st) }}>{s.lb}</div>
            </div>;
          })}</div>

          {/* VERDICT */}
          {data.verdict && (
            <div className={"vc fade " + (data.verdict.bias === "BULLISH" ? "bull" : data.verdict.bias === "BEARISH" ? "bear" : "neu")}>
              <div className="vh">
                <div>
                  <div className="vbias" style={{ color: data.verdict.bias === "BULLISH" ? "#00e676" : data.verdict.bias === "BEARISH" ? "#ff5252" : "#ffa726" }}>
                    {data.verdict.bias === "BULLISH" ? "▲" : data.verdict.bias === "BEARISH" ? "▼" : "◆"} {data.verdict.bias}
                  </div>
                  {data.verdict.title && <div className="vtitle">{data.verdict.title}</div>}
                </div>
                <div className="vconf" style={{
                  color: data.verdict.confidence === "HIGH" ? "#00e676" : data.verdict.confidence === "MEDIUM" ? "#ffa726" : "#ff5252",
                  borderColor: data.verdict.confidence === "HIGH" ? "rgba(0,230,118,.25)" : "rgba(255,167,38,.25)"
                }}>{data.verdict.confidence}</div>
              </div>
              <p className="vsum">{data.verdict.summary}</p>
              {data.verdict.key_levels && <div className="vlev">🎯 {data.verdict.key_levels}</div>}
              {(data.verdict.bull_case || data.verdict.bear_case) && (
                <div className="vscs">
                  <div className="vsc">
                    <div className="vscl" style={{ color: "#00e676" }}>▲ BULL CASE</div>
                    <div className="vsct">{data.verdict.bull_case || "—"}</div>
                  </div>
                  <div className="vsc">
                    <div className="vscl" style={{ color: "#ff5252" }}>▼ BEAR CASE</div>
                    <div className="vsct">{data.verdict.bear_case || "—"}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ANALYSIS BOXES */}
          <div className="arow">
            {data.flows && (
              <div className="abox fade ab-cyan">
                <div className="alab">💰 FLUX INSTITUTIONNELS</div>
                <p className="atxt">{data.flows}</p>
              </div>
            )}
            {data.intermarket && (
              <div className="abox fade ab-orange">
                <div className="alab">🔗 INTERMARCHÉ</div>
                <p className="atxt">{data.intermarket}</p>
              </div>
            )}
          </div>

          {data.session_plan && (
            <div className="abox fade ab-pink" style={{ marginBottom: 20 }}>
              <div className="alab">📅 PLAN DE SESSION</div>
              <p className="atxt">{data.session_plan}</p>
            </div>
          )}

          {/* NEWS */}
          {data.news && data.news.length > 0 && (
            <div>
              <div className="sec">⚠ NEWS FEED ({data.news.length})</div>
              <div className="nl">{data.news.map(function (n, i) {
                var impC = n.impact === "HIGH" ? "#ff5252" : "#ffa726";
                var biasC = n.bias === "BULL" ? "#00e676" : n.bias === "BEAR" ? "#ff5252" : "#78909c";
                var biasI = n.bias === "BULL" ? "▲" : n.bias === "BEAR" ? "▼" : "—";
                return (
                  <div key={i} className="ni fade" style={{ borderLeftColor: impC, animationDelay: i * 40 + "ms" }}>
                    <div className="nh">
                      <span className="nimp" style={{ color: impC }}>{n.impact}</span>
                      <span className="nti">{n.title}</span>
                      <span className="nbias" style={{ color: biasC }}>{biasI} {n.bias}</span>
                    </div>
                    <div className="ndet">{n.detail}</div>
                  </div>
                );
              })}</div>
            </div>
          )}

          {/* TRADINGVIEW ECONOMIC CALENDAR */}
          <div style={{ marginTop: 24 }}>
            <div className="sec">📅 CALENDRIER ÉCONOMIQUE</div>
            <div className="tv-cal">
              <TVWidget
                src="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
                config={{
                  colorTheme: "dark",
                  isTransparent: true,
                  width: "100%",
                  height: "400",
                  locale: "fr",
                  importanceFilter: "0,1",
                  countryFilter: "us,eu,gb,jp"
                }}
              />
            </div>
          </div>

        </div>
      )}

      {/* FOOTER */}
      <footer className="ft">
        <span>FLOW BRIEFING · Institutional NQ Scalper Dashboard</span>
        <span>TradingView + Claude Haiku · ~$0.005/scan</span>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════ */

var STYLES = [
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700;800&display=swap');",
  ":root{--m:'IBM Plex Mono',monospace;--s:'DM Sans',sans-serif;--bg:#060810;--bg2:#0a0d15;--bg3:#10131d;--bd:#161a28;--bd2:#1e2336;--tx:#c8ccd8;--t2:#6870889;--t3:#3a3f54;--c:#00d4ff;--g:#00e676;--r:#ff5252;--o:#ffa726;--pk:#f472b6}",
  "*{box-sizing:border-box;margin:0;padding:0}",
  "body{background:var(--bg);font-family:var(--s)}",
  ".root{background:var(--bg);color:var(--tx);min-height:100vh}",

  /* Ticker */
  ".tv-ticker{border-bottom:1px solid var(--bd);overflow:hidden}",
  ".tv-ticker .tradingview-widget-copyright{display:none!important}",

  /* Header */
  ".hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 28px;border-bottom:1px solid var(--bd);background:rgba(6,8,16,.92);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}",
  ".logo{display:flex;align-items:center;gap:14px}",
  ".lm{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.03));border:1px solid rgba(0,212,255,.2);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--c)}",
  ".lt{font-family:var(--m);font-size:14px;font-weight:700;color:#fff;letter-spacing:2.5px}",
  ".ls{font-size:10px;color:var(--t3);letter-spacing:.5px;margin-top:1px}",
  ".acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".tb{font-family:var(--m);font-size:10px;color:var(--t3)}",

  /* Buttons */
  ".btn{font-family:var(--m);font-size:11px;font-weight:500;padding:7px 18px;border-radius:6px;cursor:pointer;transition:all .15s;border:none;letter-spacing:.3px}",
  ".bp{background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);color:var(--c)}",
  ".bp:hover{background:rgba(0,212,255,.15);transform:translateY(-1px)}",
  ".bp:disabled{opacity:.4;cursor:default;transform:none}",
  ".bg{background:transparent;border:1px solid var(--bd);color:var(--t2);padding:7px 12px}",
  ".bg:hover{border-color:var(--bd2);color:var(--tx)}",
  ".bd{background:rgba(88,101,242,.1);border:1px solid rgba(88,101,242,.25);color:#7289da;padding:7px 12px}",

  /* Progress */
  ".prog{padding:10px 28px;font-family:var(--m);font-size:11px;color:var(--c);background:rgba(0,212,255,.02);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px}",
  "@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}",
  ".dot{animation:blink 1s infinite;font-size:8px}",

  /* Empty */
  ".empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:65vh;text-align:center;padding:48px 24px}",
  ".ei{font-size:44px;opacity:.12;margin-bottom:28px}",
  ".eh{font-family:var(--m);font-size:20px;color:#fff;letter-spacing:2px;margin-bottom:10px;font-weight:700}",
  ".ep{font-size:13px;color:var(--t3);max-width:420px;line-height:1.7;margin-bottom:24px}",
  ".sp{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:28px}",
  ".sc{font-family:var(--m);font-size:10px;padding:5px 12px;border:1px solid;border-radius:5px;display:flex;gap:6px}",
  ".bs{font-family:var(--m);font-size:14px;font-weight:600;padding:14px 44px;border-radius:8px;cursor:pointer;background:linear-gradient(135deg,rgba(0,212,255,.1),rgba(0,212,255,.03));border:1px solid rgba(0,212,255,.25);color:var(--c);letter-spacing:1.5px;transition:all .2s}",
  ".bs:hover{transform:scale(1.03);box-shadow:0 0 40px rgba(0,212,255,.12)}",

  /* Error */
  ".err{margin:24px 28px;padding:20px;background:rgba(255,82,82,.05);border:1px solid rgba(255,82,82,.12);border-radius:10px;color:var(--r);font-size:12px;text-align:center;line-height:1.6}",

  /* Skeleton */
  "@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}",
  ".sk{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}",

  /* Content */
  ".ct{padding:20px 28px 48px;max-width:1200px;margin:0 auto}",

  /* Sessions */
  ".sb{display:flex;gap:5px;margin-bottom:20px;overflow-x:auto;padding-bottom:2px}",
  ".si{flex:1;min-width:85px;background:var(--bg2);border:1px solid var(--bd);border-radius:7px;padding:8px 10px;text-align:center}",
  ".sd{width:7px;height:7px;border-radius:50%;margin:0 auto 4px}",
  ".sn{font-size:9px;color:var(--t2);font-weight:500;letter-spacing:.3px}",
  ".stm{font-family:var(--m);font-size:8px;color:var(--t3);margin-top:1px}",
  ".slb{font-family:var(--m);font-size:10px;font-weight:700;margin-top:3px}",

  /* Verdict */
  ".vc{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden}",
  ".vc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}",
  ".vc.bull::before{background:linear-gradient(90deg,transparent,var(--g),transparent)}",
  ".vc.bear::before{background:linear-gradient(90deg,transparent,var(--r),transparent)}",
  ".vc.neu::before{background:linear-gradient(90deg,transparent,var(--o),transparent)}",
  ".vh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px}",
  ".vbias{font-family:var(--m);font-size:22px;font-weight:700;letter-spacing:3px}",
  ".vtitle{font-size:13px;color:var(--t2);margin-top:4px;font-weight:500}",
  ".vconf{font-family:var(--m);font-size:11px;padding:4px 14px;border-radius:5px;font-weight:600;border:1px solid}",
  ".vsum{font-size:14px;line-height:1.8;margin-bottom:16px;color:#dde}",
  ".vlev{font-family:var(--m);font-size:12px;color:var(--c);background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.1);border-radius:8px;padding:12px 16px;margin-bottom:16px;line-height:1.6}",
  ".vscs{display:grid;grid-template-columns:1fr 1fr;gap:12px}",
  ".vsc{background:rgba(255,255,255,.012);border:1px solid var(--bd);border-radius:8px;padding:14px 16px}",
  ".vscl{font-family:var(--m);font-size:11px;font-weight:700;margin-bottom:8px;letter-spacing:.5px}",
  ".vsct{font-size:12px;color:var(--t2);line-height:1.6}",

  /* Analysis boxes */
  ".arow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}",
  ".abox{background:var(--bg2);border:1px solid var(--bd);border-radius:0 10px 10px 0;padding:16px 20px}",
  ".ab-cyan{border-left:2px solid var(--c)}",
  ".ab-orange{border-left:2px solid var(--o)}",
  ".ab-pink{border-left:2px solid var(--pk)}",
  ".alab{font-family:var(--m);font-size:10px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:8px}",
  ".atxt{font-size:12px;line-height:1.7;color:var(--t2)}",

  /* Section title */
  ".sec{font-family:var(--m);font-size:11px;font-weight:600;color:var(--t3);letter-spacing:2px;margin:20px 0 12px;display:flex;align-items:center;gap:8px}",

  /* News */
  ".nl{display:flex;flex-direction:column;gap:4px}",
  ".ni{padding:12px 16px;background:var(--bg2);border-left:3px solid var(--bd);border-radius:0 8px 8px 0;transition:all .12s}",
  ".ni:hover{background:var(--bg3);transform:translateX(3px)}",
  ".nh{display:flex;align-items:center;gap:10px;margin-bottom:6px}",
  ".nimp{font-family:var(--m);font-size:9px;font-weight:700;letter-spacing:.5px;flex-shrink:0}",
  ".nti{font-size:13px;font-weight:600;color:#eee;flex:1}",
  ".nbias{font-family:var(--m);font-size:10px;font-weight:700;flex-shrink:0}",
  ".ndet{font-size:11px;color:var(--t2);line-height:1.5}",

  /* TradingView calendar */
  ".tv-cal{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;overflow:hidden;min-height:400px}",
  ".tv-cal .tradingview-widget-copyright{display:none!important}",

  /* Animation */
  "@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}",
  ".fade{animation:fadeUp .3s ease both}",

  /* Modal */
  ".mo{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center}",
  ".md{background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;padding:32px;width:440px;max-width:90vw}",
  ".mhd{font-family:var(--m);font-size:14px;color:#fff;margin-bottom:20px;letter-spacing:.5px}",
  ".mlb{font-size:11px;color:var(--t2);display:block;margin-bottom:8px}",
  ".mi{width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--bd);border-radius:7px;color:var(--tx);font-family:var(--m);font-size:11px;outline:none;margin-bottom:16px}",
  ".mi:focus{border-color:var(--bd2)}",
  ".mact{display:flex;justify-content:flex-end;gap:10px}",

  /* Footer */
  ".ft{padding:16px 28px;border-top:1px solid var(--bd);display:flex;justify-content:space-between;font-family:var(--m);font-size:9px;color:var(--t3);letter-spacing:.5px}",

  /* Toast */
  ".toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-family:var(--m);font-size:11px;z-index:200;animation:fadeUp .3s ease;border:1px solid}",
  ".sending{background:rgba(88,101,242,.15);border-color:rgba(88,101,242,.3);color:#7289da}",
  ".sent{background:rgba(0,230,118,.1);border-color:rgba(0,230,118,.2);color:var(--g)}",
  ".error{background:rgba(255,82,82,.08);border-color:rgba(255,82,82,.15);color:var(--r)}",

  /* Responsive */
  "@media(max-width:768px){.vscs{grid-template-columns:1fr}.arow{grid-template-columns:1fr}.ct{padding:16px}.sb{flex-wrap:wrap}}",
  "::-webkit-scrollbar{width:3px}",
  "::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}"
].join("\n");
