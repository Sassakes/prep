import { useState, useEffect, useCallback, useRef } from "react";

/* ═══ PROMPT ═══ */
var SYSTEM_PROMPT =
  "Tu es un analyste macro senior dans un prop trading desk." +
  " Tu prépares le morning briefing pour un scalper NQ futures." +
  "\n\nDATE: Nous sommes en MARS 2026." +
  " Base-toi UNIQUEMENT sur les titres RSS fournis." +
  "\n\nINTERDIT de donner des prix. Les prix viennent de TradingView." +
  "\n\nInclus une analyse VOLATILITÉ: évalue le VIX implicite basé sur les news," +
  " la chaleur géopolitique/macro, et prédit la volatilité session US." +
  "\n\nRéponds UNIQUEMENT en JSON valide." +
  "\n\n{" +
  '\n  "verdict":{"bias":"BULLISH|BEARISH|NEUTRE","confidence":"HIGH|MEDIUM|LOW","title":"5-8 mots","summary":"4-6 phrases","bull_case":"2 phrases","bear_case":"2 phrases"},' +
  '\n  "volatility":{"level":"LOW|MEDIUM|HIGH|EXTREME","assessment":"VIX + news heat 2 phrases","expected":"Range et type de session attendu 1-2 phrases","times":"Horaires CET des pics vol"},' +
  '\n  "flows":"Flux institutionnels 3 phrases",' +
  '\n  "intermarket":"Corrélations 2-3 phrases",' +
  '\n  "session_plan":"Plan session CET 3 phrases",' +
  '\n  "week_summary":"Résumé semaine 3-4 phrases",' +
  '\n  "news":[{"title":"Titre","impact":"HIGH|MEDIUM","bias":"BULL|BEAR|NEUTRE","detail":"1-2 phrases"}]' +
  "\n}" +
  "\n\nMinimum 6 news. JSON VALIDE. Pas de virgule avant } ou ].";

/* ═══ AUTH ═══ */
function checkPw(input) { return input === "azertyuiop78945123"; }
function getAuth() { try { return JSON.parse(localStorage.getItem("fb_auth") || "{}"); } catch (e) { return {}; } }
function setAuth(v) { try { localStorage.setItem("fb_auth", JSON.stringify(v)); } catch (e) {} }

/* ═══ SESSIONS ═══ */
function getTimeInfo() {
  var now = new Date();
  var cet, est;
  try {
    cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  } catch (e) { cet = now; est = now; }
  var cetH = cet.getHours(); var cetM = cet.getMinutes();
  var estH = est.getHours(); var estM = est.getMinutes();
  var cetStr = String(cetH).padStart(2, "0") + ":" + String(cetM).padStart(2, "0");
  var estStr = String(estH).padStart(2, "0") + ":" + String(estM).padStart(2, "0");
  var t = cetH * 60 + cetM;
  var pct = Math.max(0, Math.min(100, ((t - 480) / (900)) * 100)); // 08:00-23:00 range

  var list = [
    { name: "London Open", mins: 540 },
    { name: "EU Close", mins: 840 },
    { name: "US Pre-Mkt", mins: 870 },
    { name: "US Open", mins: 930 },
    { name: "Power Hour", mins: 1260 },
    { name: "US Close", mins: 1320 }
  ];
  var sessions = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i].mins - t;
    var st = d < -30 ? "done" : d < 0 ? "live" : d < 60 ? "soon" : "wait";
    var lb = st === "done" ? "" : st === "live" ? "LIVE" : st === "soon" ? d + "min" : Math.floor(d / 60) + "h" + String(d % 60).padStart(2, "0");
    var hh = Math.floor(list[i].mins / 60);
    var mm = list[i].mins % 60;
    sessions.push({ name: list[i].name, st: st, lb: lb, tm: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") });
  }
  return { sessions: sessions, cetStr: cetStr, estStr: estStr, pct: pct };
}

function safeJSON(str) {
  var c = str.replace(/```json/g, "").replace(/```/g, "").trim();
  var m = c.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) {
    try { return JSON.parse(m[0].replace(/,(\s*[}\]])/g, "$1")); } catch (e2) { return null; }
  }
}

/* ═══ TV Widget ═══ */
function TVWidget(props) {
  var ref = useRef(null);
  useEffect(function () {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    var d = document.createElement("div");
    d.className = "tradingview-widget-container__widget";
    ref.current.appendChild(d);
    var s = document.createElement("script");
    s.type = "text/javascript"; s.src = props.src; s.async = true;
    s.textContent = JSON.stringify(props.config);
    ref.current.appendChild(s);
  }, []);
  return <div ref={ref} className="tradingview-widget-container" />;
}

/* ═══ APP ═══ */
export default function App() {
  var _d = useState(null); var data = _d[0]; var setData = _d[1];
  var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
  var _e = useState(null); var error = _e[0]; var setError = _e[1];
  var _r = useState(null); var refreshed = _r[0]; var setRefreshed = _r[1];
  var _ti = useState(getTimeInfo()); var timeInfo = _ti[0]; var setTimeInfo = _ti[1];
  var _st = useState(""); var step = _st[0]; var setStep = _st[1];
  var _auth = useState(false); var authed = _auth[0]; var setAuthed = _auth[1];
  var _menu = useState(false); var menuOpen = _menu[0]; var setMenuOpen = _menu[1];
  var _pw = useState(""); var pw = _pw[0]; var setPw = _pw[1];
  var _pwE = useState(""); var pwErr = _pwE[0]; var setPwErr = _pwE[1];
  var _spw = useState(false); var showPw = _spw[0]; var setShowPw = _spw[1];
  var _wh1 = useState(""); var wh1 = _wh1[0]; var setWh1 = _wh1[1];
  var _wh2 = useState(""); var wh2 = _wh2[0]; var setWh2 = _wh2[1];
  var _tw1 = useState(""); var tw1 = _tw1[0]; var setTw1 = _tw1[1];
  var _tw2 = useState(""); var tw2 = _tw2[0]; var setTw2 = _tw2[1];
  var _aen = useState(true); var autoEnabled = _aen[0]; var setAutoEnabled = _aen[1];
  var _ewh = useState(false); var editWh = _ewh[0]; var setEditWh = _ewh[1];
  var _ds = useState(null); var dSt = _ds[0]; var setDSt = _ds[1];
  var _ini = useState(true); var initialLoad = _ini[0]; var setInitialLoad = _ini[1];

  /* Load from KV on mount */
  useEffect(function () {
    // Auth
    var a = getAuth(); if (a.ok) setAuthed(true);
    // Timer
    var t = setInterval(function () { setTimeInfo(getTimeInfo()); }, 30000);
    // Load briefing from server
    fetch("/api/store?key=briefing").then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.data) { setData(d.data); setRefreshed(new Date(d.time)); }
    }).catch(function () {}).finally(function () { setInitialLoad(false); });
    // Load settings from server
    fetch("/api/store?key=settings").then(function (r) { return r.json(); }).then(function (d) {
      if (d) {
        if (d.webhook1) { setWh1(d.webhook1); setTw1(d.webhook1); }
        if (d.webhook2) { setWh2(d.webhook2); setTw2(d.webhook2); }
        if (d.autoDisabled === true) setAutoEnabled(false);
      }
    }).catch(function () {});
    return function () { clearInterval(t); };
  }, []);

  /* Auth */
  var tryLogin = function () {
    var a = getAuth(); var now = Date.now();
    if (a.lockedUntil > now) { setPwErr("Verrouillé " + Math.ceil((a.lockedUntil - now) / 60000) + " min"); return; }
    if (checkPw(pw)) { setAuth({ ok: true, attempts: 0, lockedUntil: 0 }); setAuthed(true); setPw(""); setPwErr(""); setShowPw(false); }
    else {
      var att = (a.attempts || 0) + 1;
      var lock = att >= 5 ? now + 1800000 : 0;
      setAuth({ ok: false, attempts: att, lockedUntil: lock });
      setPwErr(lock ? "Verrouillé 30 min" : "Incorrect (" + att + "/5)");
    }
    setPw("");
  };

  /* Save settings to KV */
  var saveSettings = function () {
    setWh1(tw1); setWh2(tw2);
    var cfg = { webhook1: tw1, webhook2: tw2, autoDisabled: !autoEnabled };
    fetch("/api/store?key=settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg)
    }).catch(function () {});
    setEditWh(false);
  };

  /* Discord */
  var sendDiscord = async function (whUrl, payload) {
    if (!whUrl) return false;
    try {
      var r = await fetch(whUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return r.ok;
    } catch (e) { return false; }
  };

  var sendBothDiscord = async function () {
    if (!data) return;
    setDSt("sending");
    var v = data.verdict || {};
    var vol = data.volatility || {};
    var col = v.bias === "BULLISH" ? 0x00e676 : v.bias === "BEARISH" ? 0xff5252 : 0xffa726;
    var em = v.bias === "BULLISH" ? "🟢" : v.bias === "BEARISH" ? "🔴" : "🟡";
    var volE = vol.level === "EXTREME" ? "🔴🔴" : vol.level === "HIGH" ? "🔴" : vol.level === "MEDIUM" ? "🟡" : "🟢";
    var dt = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    var url1 = wh1 || ""; var url2 = wh2 || "";
    try { url1 = localStorage.getItem("fb_wh1") || url1; } catch (e) {}
    try { url2 = localStorage.getItem("fb_wh2") || url2; } catch (e) {}

    var ok1 = true; var ok2 = true;
    if (url1) {
      ok1 = await sendDiscord(url1, {
        content: "# ⚡ FLOW BRIEFING — " + dt.toUpperCase(),
        embeds: [
          { title: em + " " + v.bias + " (" + v.confidence + ")", description: "**" + (v.title || "") + "**\n\n" + (v.summary || "").slice(0, 900), color: col },
          { title: "🎯 Scénarios", description: ("**▲ BULL:** " + (v.bull_case || "—") + "\n\n**▼ BEAR:** " + (v.bear_case || "—")).slice(0, 1024), color: col },
          { title: volE + " Volatilité: " + (vol.level || "—"), description: ((vol.assessment || "") + "\n" + (vol.expected || "") + "\n⏰ " + (vol.times || "")).slice(0, 1024), color: vol.level === "HIGH" || vol.level === "EXTREME" ? 0xff5252 : 0xffa726 },
          { title: "💰 Flux", description: (data.flows || "—").slice(0, 1024), color: 0x00d4ff },
          { title: "🔗 Intermarché", description: (data.intermarket || "—").slice(0, 1024), color: 0xffa726 },
          { title: "📋 Semaine", description: (data.week_summary || "—").slice(0, 1024), color: 0x34d399 },
          { title: "📅 Session", description: (data.session_plan || "—").slice(0, 1024), color: 0xf472b6 }
        ]
      });
    }
    if (url2) {
      var nws = (data.news || []).map(function (n) {
        var ic = n.bias === "BULL" ? "🟢" : n.bias === "BEAR" ? "🔴" : "⚪";
        return ic + " **[" + n.impact + "]** " + n.title + "\n" + (n.detail || "");
      }).join("\n\n");
      ok2 = await sendDiscord(url2, {
        content: "# 📰 NEWS — " + dt.toUpperCase(),
        embeds: [{ title: "⚠️ Market News (" + (data.news || []).length + ")", description: (nws || "—").slice(0, 4000), color: 0xff4444 }]
      });
    }
    setDSt(ok1 && ok2 ? "sent" : "error");
    setTimeout(function () { setDSt(null); }, 3000);
  };

  /* Scan */
  var scan = useCallback(async function () {
    setLoading(true); setError(null);
    var now = new Date();
    var ds = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var ts = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    setStep("① Récupération des news...");
    var headlines = "(RSS indisponibles)";
    try {
      var fr = await fetch("/api/feeds");
      var fj = await fr.json();
      if (fj.feeds && fj.feeds.length > 0) {
        var parts = [];
        for (var i = 0; i < fj.feeds.length; i++) {
          parts.push("[" + fj.feeds[i].tag + "] " + fj.feeds[i].items.slice(0, 4).join(" | "));
        }
        headlines = parts.join("\n");
      }
    } catch (e) {}

    setStep("② Analyse en cours...");
    try {
      var resp = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: ds + " " + ts + " CET (mars 2026). Briefing NQ. AUCUN PRIX.\n\n" + headlines }]
        })
      });
      if (!resp.ok) { var et = ""; try { et = await resp.text(); } catch (x) {} throw new Error("Serveur " + resp.status + ": " + et.slice(0, 150)); }
      var txt = await resp.text();
      var result; try { result = JSON.parse(txt); } catch (pe) { throw new Error("Réponse non-JSON"); }
      if (result.error) throw new Error(typeof result.error === "string" ? result.error : result.error.message || "Erreur API");
      var full = "";
      for (var k = 0; k < (result.content || []).length; k++) { if (result.content[k].type === "text") full += result.content[k].text; }
      if (!full) throw new Error("Réponse vide");
      var parsed = safeJSON(full);
      if (!parsed) throw new Error("JSON invalide");

      setData(parsed);
      var nowTime = new Date();
      setRefreshed(nowTime);
      setTimeInfo(getTimeInfo());

      // Save to KV
      setStep("③ Sauvegarde...");
      fetch("/api/store?key=briefing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed, time: nowTime.toISOString() })
      }).catch(function () {});

      // Auto discord
      var url1 = wh1 || ""; var url2 = wh2 || "";
      if (url1 || url2) setTimeout(function () { sendBothDiscord(); }, 800);

    } catch (e) { setError(e.message || "Erreur"); }
    setLoading(false); setStep(""); setMenuOpen(false);
  }, [wh1, wh2]);

  var sc = function (s) { return s === "live" ? "#00e676" : s === "soon" ? "#ffa726" : s === "done" ? "#555" : "#687088"; };
  var hasData = data !== null;
  var sess = timeInfo.sessions;

  return (
    <div className="root">
      <style>{STYLES}</style>

      <div className="tv-tape"><TVWidget src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js" config={{
        symbols: [
          { description: "Nasdaq 100", proName: "NASDAQ:NDX" },
          { description: "S&P 500", proName: "FOREXCOM:SPXUSD" },
          { description: "Russell 2000", proName: "FOREXCOM:RUSSELLUSD" },
          { description: "VIX", proName: "CBOE:VIX" },
          { description: "Dollar Index", proName: "TVC:DXY" },
          { description: "WTI", proName: "TVC:USOIL" },
          { description: "Gold", proName: "TVC:GOLD" },
          { description: "EUR/USD", proName: "FX:EURUSD" },
          { description: "US 10Y", proName: "TVC:US10Y" },
          { description: "Bitcoin", proName: "BITSTAMP:BTCUSD" }
        ],
        showSymbolLogo: true, isTransparent: true, displayMode: "adaptive", colorTheme: "dark", locale: "fr"
      }} /></div>

      <header className="hdr">
        <div className="logo"><div className="lm">⚡</div><div><div className="lt">FLOW BRIEFING</div><div className="ls">Institutional Morning Desk</div></div></div>
        <div className="acts">
          {refreshed && <span className="tb">{refreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {refreshed.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
          <button className="btn bg gear-btn" onClick={function () { if (authed) setMenuOpen(!menuOpen); else setShowPw(!showPw); }}>{authed ? "◆" : "⚙"}</button>
        </div>
      </header>

      {showPw && !authed && (
        <div className="pw-bar fade">
          <div className="pw-inner">
            <input className="pw-input" type="password" placeholder="Mot de passe admin..." value={pw} onChange={function (e) { setPw(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") tryLogin(); }} />
            <button className="btn bp pw-btn" onClick={tryLogin}>→</button>
          </div>
          {pwErr && <div className="pw-err">{pwErr}</div>}
        </div>
      )}

      {menuOpen && authed && (
        <div className="admin-menu fade">
          <div className="am-hdr"><span className="am-title">◆ ADMIN</span><button className="am-x" onClick={function () { setMenuOpen(false); }}>✕</button></div>
          <div className="am-sec">
            <div className="am-lab">ACTIONS</div>
            <button className={"am-btn am-primary" + (loading ? " am-dis" : "")} onClick={scan} disabled={loading}>{loading ? "◌ Scan..." : "↻ Nouveau Briefing"}</button>
            {hasData && <button className="am-btn am-discord" onClick={sendBothDiscord}>{dSt === "sending" ? "◌ Envoi..." : dSt === "sent" ? "✓ Envoyé !" : "📨 Envoyer sur Discord"}</button>}
          </div>
          <div className="am-sec">
            <div className="am-lab">WEBHOOKS DISCORD</div>
            {!editWh ? (
              <div>
                <div className="am-wh"><span className="am-whv">Analyse: {wh1 ? wh1.slice(0, 35) + "..." : "—"}</span></div>
                <div className="am-wh"><span className="am-whv">News: {wh2 ? wh2.slice(0, 35) + "..." : "—"}</span></div>
                <button className="am-sm" onClick={function () { setTw1(wh1); setTw2(wh2); setEditWh(true); }}>Modifier</button>
              </div>
            ) : (
              <div>
                <label className="am-lbl">Webhook 1 — Analyse & Verdict</label>
                <input className="am-inp" value={tw1} onChange={function (e) { setTw1(e.target.value); }} placeholder="https://discord.com/api/webhooks/..." />
                <label className="am-lbl">Webhook 2 — News</label>
                <input className="am-inp" value={tw2} onChange={function (e) { setTw2(e.target.value); }} placeholder="https://discord.com/api/webhooks/..." />
                <div className="am-row"><button className="am-sm" onClick={function () { setEditWh(false); }}>Annuler</button><button className="am-sm am-sm-p" onClick={saveSettings}>Sauvegarder</button></div>
              </div>
            )}
          </div>
          <div className="am-sec">
            <div className="am-lab">SCAN AUTOMATIQUE (13:15 CET)</div>
            <div className="am-toggle-row">
              <button className={"toggle" + (autoEnabled ? " on" : "")} onClick={function () {
                var nv = !autoEnabled; setAutoEnabled(nv);
                fetch("/api/store?key=settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhook1: wh1, webhook2: wh2, autoDisabled: !nv }) }).catch(function () {});
              }} />
              <span className="am-tog-txt">{autoEnabled ? "Activé — scan auto chaque jour" : "Désactivé"}</span>
            </div>
          </div>
          <div className="am-sec am-foot"><button className="am-out" onClick={function () { setAuth({ ok: false, attempts: 0, lockedUntil: 0 }); setAuthed(false); setMenuOpen(false); }}>Déconnexion</button><span className="am-inf">Sonnet 4 · ~$0.03/scan</span></div>
        </div>
      )}

      {step && <div className="prog"><span className="dot">●</span> {step}</div>}
      {dSt && <div className={"toast " + dSt}>{dSt === "sending" ? "📨 Envoi..." : dSt === "sent" ? "✓ Envoyé" : "✗ Erreur webhook"}</div>}
      {error && !loading && <div className="err">⚠ {error}</div>}

      {!hasData && !loading && !initialLoad && (
        <div className="empty"><div className="ei">⚡</div><h2 className="eh">FLOW BRIEFING</h2><p className="ep">Aucun briefing disponible.</p></div>
      )}
      {(loading || initialLoad) && !hasData && (
        <div className="ct"><div className="sk" style={{ height: 100, marginBottom: 14 }} /><div className="sk" style={{ height: 60, marginBottom: 8 }} /><div className="sk" style={{ height: 60, marginBottom: 8 }} /></div>
      )}

      {hasData && !loading && (
        <div className="ct">

          {/* TIMELINE */}
          <div className="tl-wrap">
            <div className="tl-times">
              <span className="tl-clock">🇫🇷 {timeInfo.cetStr} CET</span>
              <span className="tl-clock">🇺🇸 {timeInfo.estStr} EST</span>
            </div>
            <div className="tl-bar">
              <div className="tl-cursor" style={{ left: timeInfo.pct + "%" }} />
              {sess.map(function (s, i) {
                var pos = ((s.mins || (parseInt(s.tm) * 60 + parseInt(s.tm.split(":")[1]))) - 480) / 900 * 100;
                var mins = parseInt(s.tm.split(":")[0]) * 60 + parseInt(s.tm.split(":")[1]);
                var p = Math.max(0, Math.min(100, (mins - 480) / 900 * 100));
                return <div key={i} className={"tl-mark " + s.st} style={{ left: p + "%" }}>
                  <div className="tl-dot" style={{ background: sc(s.st) }} />
                  <div className="tl-info">
                    <span className="tl-name">{s.name}</span>
                    <span className="tl-tm">{s.tm}</span>
                    {s.lb && <span className="tl-lb" style={{ color: sc(s.st) }}>{s.lb}</span>}
                  </div>
                </div>;
              })}
            </div>
          </div>

          {/* VERDICT */}
          {data && data.verdict && (
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
                  <div className="vsc"><div className="vscl" style={{ color: "#00e676" }}>▲ BULL</div><div className="vsct">{data.verdict.bull_case || "—"}</div></div>
                  <div className="vsc"><div className="vscl" style={{ color: "#ff5252" }}>▼ BEAR</div><div className="vsct">{data.verdict.bear_case || "—"}</div></div>
                </div>
              )}
            </div>
          )}

          {/* VOLATILITY */}
          {data && data.volatility && (
            <div className={"vol-card fade vol-" + (data.volatility.level || "medium").toLowerCase()}>
              <div className="vol-head">
                <span className="vol-icon">{data.volatility.level === "EXTREME" ? "🔴🔴" : data.volatility.level === "HIGH" ? "🔴" : data.volatility.level === "MEDIUM" ? "🟡" : "🟢"}</span>
                <span className="vol-lev">VOLATILITÉ: {data.volatility.level}</span>
              </div>
              {data.volatility.assessment && <p className="vol-txt">{data.volatility.assessment}</p>}
              {data.volatility.expected && <p className="vol-txt">{data.volatility.expected}</p>}
              {data.volatility.times && <p className="vol-times">⏰ {data.volatility.times}</p>}
            </div>
          )}

          {data && data.week_summary && <div className="abox fade ab-green"><div className="alab">📋 RÉSUMÉ SEMAINE</div><p className="atxt">{data.week_summary}</p></div>}
          <div className="arow">
            {data && data.flows && <div className="abox fade ab-cyan"><div className="alab">💰 FLUX INSTITUTIONNELS</div><p className="atxt">{data.flows}</p></div>}
            {data && data.intermarket && <div className="abox fade ab-orange"><div className="alab">🔗 INTERMARCHÉ</div><p className="atxt">{data.intermarket}</p></div>}
          </div>
          {data && data.session_plan && <div className="abox fade ab-pink"><div className="alab">📅 PLAN DE SESSION</div><p className="atxt">{data.session_plan}</p></div>}

          {/* NEWS */}
          {data && data.news && data.news.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="sec">⚠ NEWS ({data.news.length})</div>
              <div className="nl">{data.news.map(function (n, i) {
                var impC = n.impact === "HIGH" ? "#ff5252" : "#ffa726";
                var biasC = n.bias === "BULL" ? "#00e676" : n.bias === "BEAR" ? "#ff5252" : "#78909c";
                return <div key={i} className="ni fade" style={{ borderLeftColor: impC, animationDelay: i * 40 + "ms" }}>
                  <div className="nh"><span className="nimp" style={{ color: impC }}>{n.impact}</span><span className="nti">{n.title}</span><span className="nbias" style={{ color: biasC }}>{n.bias === "BULL" ? "▲" : n.bias === "BEAR" ? "▼" : "—"} {n.bias}</span></div>
                  <div className="ndet">{n.detail}</div>
                </div>;
              })}</div>
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <div className="sec">📅 CALENDRIER ÉCONOMIQUE</div>
            <div className="tv-cal"><TVWidget src="https://s3.tradingview.com/external-embedding/embed-widget-events.js" config={{ colorTheme: "dark", isTransparent: true, width: "100%", height: "400", locale: "fr", importanceFilter: "0,1", countryFilter: "us,eu,gb,jp" }} /></div>
          </div>
        </div>
      )}

      <footer className="ft"><span>FLOW BRIEFING · Institutional NQ Desk</span><span>TradingView · Investing.com · Sonnet</span></footer>
    </div>
  );
}

/* ═══ STYLES ═══ */
var STYLES = [
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700;800&display=swap');",
  ":root{--m:'IBM Plex Mono',monospace;--s:'DM Sans',sans-serif;--bg:#060810;--bg2:#0a0d15;--bg3:#10131d;--bd:#161a28;--bd2:#1e2336;--tx:#c8ccd8;--t2:#687088;--t3:#3a3f54;--c:#00d4ff;--g:#00e676;--r:#ff5252;--o:#ffa726;--pk:#f472b6;--gn:#34d399}",
  "*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);font-family:var(--s)}.root{background:var(--bg);color:var(--tx);min-height:100vh}",
  ".tv-tape{border-bottom:1px solid var(--bd);overflow:hidden}.tv-tape .tradingview-widget-copyright{display:none!important}",
  ".hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 28px;border-bottom:1px solid var(--bd);background:rgba(6,8,16,.92);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}",
  ".logo{display:flex;align-items:center;gap:14px}.lm{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.03));border:1px solid rgba(0,212,255,.2);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--c)}.lt{font-family:var(--m);font-size:14px;font-weight:700;color:#fff;letter-spacing:2.5px}.ls{font-size:10px;color:var(--t3)}",
  ".acts{display:flex;align-items:center;gap:10px}.tb{font-family:var(--m);font-size:10px;color:var(--t3)}",
  ".btn{font-family:var(--m);font-size:11px;padding:7px 18px;border-radius:6px;cursor:pointer;transition:all .15s;border:none}.bp{background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);color:var(--c)}.bp:hover{background:rgba(0,212,255,.15)}.bg{background:transparent;border:1px solid var(--bd);color:var(--t2);padding:7px 12px}",
  ".gear-btn{font-size:13px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:8px;transition:all .2s}.gear-btn:hover{background:rgba(0,212,255,.08);border-color:rgba(0,212,255,.2);color:var(--c)}",
  ".pw-bar{padding:12px 28px;background:var(--bg2);border-bottom:1px solid var(--bd)}.pw-inner{display:flex;gap:8px;max-width:400px}.pw-input{flex:1;padding:8px 14px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-family:var(--m);font-size:12px;outline:none}.pw-input:focus{border-color:rgba(0,212,255,.3)}.pw-btn{padding:8px 16px}.pw-err{font-family:var(--m);font-size:10px;color:var(--r);margin-top:6px}",
  ".admin-menu{position:absolute;top:60px;right:20px;width:380px;max-width:calc(100vw - 40px);background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;z-index:60;box-shadow:0 20px 60px rgba(0,0,0,.6)}",
  ".am-hdr{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)}.am-title{font-family:var(--m);font-size:12px;font-weight:600;color:var(--c);letter-spacing:1.5px}.am-x{background:none;border:none;color:var(--t3);font-size:16px;cursor:pointer;padding:4px 8px;border-radius:4px}.am-x:hover{color:var(--tx);background:rgba(255,255,255,.05)}",
  ".am-sec{padding:14px 20px;border-bottom:1px solid var(--bd)}.am-lab{font-family:var(--m);font-size:9px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:10px}",
  ".am-btn{display:block;width:100%;padding:10px 16px;margin-bottom:6px;border:1px solid var(--bd);background:transparent;color:var(--tx);font-family:var(--m);font-size:11px;border-radius:7px;cursor:pointer;transition:all .15s;text-align:left}.am-btn:hover{background:rgba(255,255,255,.03)}.am-primary{border-color:rgba(0,212,255,.2);color:var(--c)}.am-primary:hover{background:rgba(0,212,255,.08)}.am-discord{border-color:rgba(88,101,242,.25);color:#7289da}.am-discord:hover{background:rgba(88,101,242,.08)}.am-dis{opacity:.4;cursor:default}",
  ".am-wh{margin-bottom:4px}.am-whv{font-family:var(--m);font-size:10px;color:var(--t2)}.am-sm{background:transparent;border:1px solid var(--bd);color:var(--t2);font-family:var(--m);font-size:10px;padding:5px 12px;border-radius:5px;cursor:pointer;margin-top:8px}.am-sm:hover{border-color:var(--bd2);color:var(--tx)}.am-sm-p{border-color:rgba(0,212,255,.2);color:var(--c);margin-left:6px}",
  ".am-lbl{font-size:10px;color:var(--t2);display:block;margin:8px 0 4px}.am-inp{width:100%;padding:7px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:5px;color:var(--tx);font-family:var(--m);font-size:10px;outline:none;margin-bottom:4px}.am-inp:focus{border-color:rgba(0,212,255,.3)}.am-row{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}",
  ".am-toggle-row{display:flex;align-items:center;gap:10px}.toggle{width:36px;height:20px;border-radius:10px;cursor:pointer;background:var(--bd);position:relative;transition:background .2s;border:none;flex-shrink:0}.toggle.on{background:rgba(0,212,255,.4)}.toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s}.toggle.on::after{transform:translateX(16px)}.am-tog-txt{font-size:10px;color:var(--t2)}",
  ".am-foot{display:flex;justify-content:space-between;align-items:center;border-bottom:none}.am-out{background:transparent;border:1px solid rgba(255,82,82,.15);color:var(--r);font-family:var(--m);font-size:10px;padding:5px 14px;border-radius:5px;cursor:pointer}.am-out:hover{background:rgba(255,82,82,.05)}.am-inf{font-family:var(--m);font-size:9px;color:var(--t3)}",
  ".prog{padding:10px 28px;font-family:var(--m);font-size:11px;color:var(--c);background:rgba(0,212,255,.02);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px}@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}.dot{animation:blink 1s infinite;font-size:8px}",
  ".empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;text-align:center;padding:48px}.ei{font-size:44px;opacity:.12;margin-bottom:24px}.eh{font-family:var(--m);font-size:20px;color:#fff;letter-spacing:2px;margin-bottom:10px}.ep{font-size:13px;color:var(--t3)}",
  ".err{margin:16px 28px;padding:16px;background:rgba(255,82,82,.05);border:1px solid rgba(255,82,82,.12);border-radius:10px;color:var(--r);font-size:12px;text-align:center}",
  "@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.sk{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}",
  ".ct{padding:20px 28px 48px;max-width:1200px;margin:0 auto}",

  /* Timeline */
  ".tl-wrap{margin-bottom:24px;padding:16px 0}",
  ".tl-times{display:flex;justify-content:space-between;margin-bottom:12px;padding:0 10px}",
  ".tl-clock{font-family:var(--m);font-size:12px;font-weight:600;color:var(--tx);letter-spacing:.5px}",
  ".tl-bar{position:relative;height:60px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;margin:0 10px}",
  ".tl-cursor{position:absolute;top:0;bottom:0;width:2px;background:var(--c);z-index:5;border-radius:1px;box-shadow:0 0 8px rgba(0,212,255,.4)}",
  ".tl-cursor::after{content:'';position:absolute;top:-4px;left:-4px;width:10px;height:10px;background:var(--c);border-radius:50%;box-shadow:0 0 12px rgba(0,212,255,.6)}",
  ".tl-mark{position:absolute;top:8px;transform:translateX(-50%);text-align:center;z-index:3}",
  ".tl-dot{width:8px;height:8px;border-radius:50%;margin:0 auto 4px;transition:all .3s}",
  ".tl-mark.live .tl-dot{box-shadow:0 0 10px rgba(0,230,118,.6);width:10px;height:10px}",
  ".tl-mark.soon .tl-dot{box-shadow:0 0 8px rgba(255,167,38,.4)}",
  ".tl-info{display:flex;flex-direction:column;align-items:center;gap:1px}",
  ".tl-name{font-size:8px;color:var(--t2);white-space:nowrap}",
  ".tl-tm{font-family:var(--m);font-size:7px;color:var(--t3)}",
  ".tl-lb{font-family:var(--m);font-size:9px;font-weight:700}",

  /* Verdict */
  ".vc{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden}.vc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.vc.bull::before{background:linear-gradient(90deg,transparent,var(--g),transparent)}.vc.bear::before{background:linear-gradient(90deg,transparent,var(--r),transparent)}.vc.neu::before{background:linear-gradient(90deg,transparent,var(--o),transparent)}",
  ".vh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px}.vbias{font-family:var(--m);font-size:22px;font-weight:700;letter-spacing:3px}.vtit{font-size:14px;color:var(--t2);margin-top:4px;font-style:italic}.vconf{font-family:var(--m);font-size:11px;padding:4px 14px;border-radius:5px;font-weight:600;border:1px solid}",
  ".vsum{font-size:14px;line-height:1.8;margin-bottom:16px;color:#dde}",
  ".vscs{display:grid;grid-template-columns:1fr 1fr;gap:12px}.vsc{background:rgba(255,255,255,.012);border:1px solid var(--bd);border-radius:8px;padding:14px 16px}.vscl{font-family:var(--m);font-size:11px;font-weight:700;margin-bottom:8px}.vsct{font-size:12px;color:var(--t2);line-height:1.6}",

  /* Volatility */
  ".vol-card{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:16px 20px;margin-bottom:16px;border-left:3px solid var(--o)}",
  ".vol-low{border-left-color:var(--g)}.vol-medium{border-left-color:var(--o)}.vol-high{border-left-color:var(--r)}.vol-extreme{border-left-color:#ff1744}",
  ".vol-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.vol-icon{font-size:14px}.vol-lev{font-family:var(--m);font-size:12px;font-weight:700;letter-spacing:1px;color:var(--tx)}",
  ".vol-txt{font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:4px}.vol-times{font-family:var(--m);font-size:10px;color:var(--c);margin-top:4px}",

  /* Analysis */
  ".arow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}",
  ".abox{background:var(--bg2);border:1px solid var(--bd);border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:12px}.ab-cyan{border-left:2px solid var(--c)}.ab-orange{border-left:2px solid var(--o)}.ab-pink{border-left:2px solid var(--pk)}.ab-green{border-left:2px solid var(--gn)}",
  ".alab{font-family:var(--m);font-size:10px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:8px}.atxt{font-size:12px;line-height:1.7;color:var(--t2)}",
  ".sec{font-family:var(--m);font-size:11px;font-weight:600;color:var(--t3);letter-spacing:2px;margin:20px 0 12px;display:flex;align-items:center;gap:8px}",

  /* News */
  ".nl{display:flex;flex-direction:column;gap:4px}.ni{padding:12px 16px;background:var(--bg2);border-left:3px solid var(--bd);border-radius:0 8px 8px 0;transition:all .12s}.ni:hover{background:var(--bg3);transform:translateX(3px)}",
  ".nh{display:flex;align-items:center;gap:10px;margin-bottom:6px}.nimp{font-family:var(--m);font-size:9px;font-weight:700;flex-shrink:0}.nti{font-size:13px;font-weight:600;color:#eee;flex:1}.nbias{font-family:var(--m);font-size:10px;font-weight:700;flex-shrink:0}.ndet{font-size:11px;color:var(--t2);line-height:1.5}",
  ".tv-cal{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;overflow:hidden;min-height:400px}.tv-cal .tradingview-widget-copyright{display:none!important}",
  "@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeUp .3s ease both}",
  ".ft{padding:16px 28px;border-top:1px solid var(--bd);display:flex;justify-content:space-between;font-family:var(--m);font-size:9px;color:var(--t3)}",
  ".toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-family:var(--m);font-size:11px;z-index:200;animation:fadeUp .3s ease;border:1px solid}.sending{background:rgba(88,101,242,.15);border-color:rgba(88,101,242,.3);color:#7289da}.sent{background:rgba(0,230,118,.1);border-color:rgba(0,230,118,.2);color:var(--g)}.error{background:rgba(255,82,82,.08);border-color:rgba(255,82,82,.15);color:var(--r)}",
  "@media(max-width:768px){.vscs{grid-template-columns:1fr}.arow{grid-template-columns:1fr}.ct{padding:16px}.admin-menu{right:10px;width:calc(100vw - 20px)}.tl-bar{overflow-x:auto}}",
  "::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}"
].join("\n");
