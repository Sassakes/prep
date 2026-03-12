import { useState, useEffect, useCallback, useRef } from "react";

/* ═══ SYSTEM PROMPT ═══ */
var SYSTEM_PROMPT =
  " Réponds TOUJOURS en français." +
  "Tu es un analyste macro senior dans un prop trading desk." +
  " Tu prépares le morning briefing pour un scalper NQ futures." +
  "\n\nDATE: Nous sommes en MARS 2026. Tes données d'entraînement peuvent être obsolètes." +
  " Base-toi UNIQUEMENT sur les titres RSS fournis pour ton analyse." +
  "\n\nINTERDIT de donner des prix spécifiques. Les prix live viennent de TradingView." +
  " Concentre-toi sur: contexte macro, analyse des news, scénarios, flux, corrélations." +
  "\n\nRéponds UNIQUEMENT en JSON valide. Aucun texte hors JSON." +
  "\n\n{" +
  '\n  "verdict": {' +
  '\n    "bias": "BULLISH ou BEARISH ou NEUTRE",' +
  '\n    "confidence": "HIGH ou MEDIUM ou LOW",' +
  '\n    "title": "Contexte en 5-8 mots",' +
  '\n    "summary": "Analyse 4-6 phrases. PAS DE PRIX.",' +
  '\n    "bull_case": "Scénario bull: trigger + description",' +
  '\n    "bear_case": "Scénario bear: trigger + description"' +
  "\n  }," +
  '\n  "flows": "Flux institutionnels 3 phrases",' +
  '\n  "intermarket": "Corrélations 2-3 phrases",' +
  '\n  "session_plan": "Plan session CET 3 phrases",' +
  '\n  "week_summary": "Résumé semaine 3-4 phrases",' +
  '\n  "news": [' +
  '\n    {"title": "Titre", "impact": "HIGH ou MEDIUM", "bias": "BULL ou BEAR ou NEUTRE", "detail": "Impact 1-2 phrases"}' +
  "\n  ]" +
  "\n}" +
  "\n\nMinimum 6 news. JSON VALIDE. Pas de virgule avant } ou ].";

/* ═══ AUTH ═══ */
var PASS_HASH = "fb_a7894"; // simple hash check
var MAX_ATTEMPTS = 5;
var LOCKOUT_MS = 30 * 60 * 1000; // 30 min

function checkPassword(input) {
  return input === "azertyuiop78945123";
}

function getAuthState() {
  try {
    var s = localStorage.getItem("fb_auth");
    if (!s) return { ok: false, attempts: 0, lockedUntil: 0 };
    return JSON.parse(s);
  } catch (e) { return { ok: false, attempts: 0, lockedUntil: 0 }; }
}

function saveAuthState(state) {
  try { localStorage.setItem("fb_auth", JSON.stringify(state)); } catch (e) {}
}

/* ═══ SESSIONS ═══ */
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
      { title: "📅 Session", description: (data.session_plan || "—").slice(0, 1024), color: 0xf472b6 },
      { title: "⚠️ News", description: (nws || "—").slice(0, 1024), color: 0xff4444 }
    ]
  };
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */

export default function App() {
  /* State */
  var _d = useState(null); var data = _d[0]; var setData = _d[1];
  var _h = useState(null); var headlines = _h[0]; var setHeadlines = _h[1];
  var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
  var _e = useState(null); var error = _e[0]; var setError = _e[1];
  var _r = useState(null); var refreshed = _r[0]; var setRefreshed = _r[1];
  var _s = useState(getSessions()); var sess = _s[0]; var setSess = _s[1];
  var _st = useState(""); var step = _st[0]; var setStep = _st[1];

  /* Auth */
  var _auth = useState(false); var authed = _auth[0]; var setAuthed = _auth[1];
  var _menu = useState(false); var menuOpen = _menu[0]; var setMenuOpen = _menu[1];
  var _pw = useState(""); var pw = _pw[0]; var setPw = _pw[1];
  var _pwErr = useState(""); var pwErr = _pwErr[0]; var setPwErr = _pwErr[1];
  var _showPw = useState(false); var showPwForm = _showPw[0]; var setShowPwForm = _showPw[1];

  /* Webhook */
  var _wh = useState(""); var webhook = _wh[0]; var setWebhook = _wh[1];
  var _tw = useState(""); var tmpWh = _tw[0]; var setTmpWh = _tw[1];
  var _editWh = useState(false); var editingWh = _editWh[0]; var setEditingWh = _editWh[1];

  /* Discord */
  var _ds = useState(null); var dSt = _ds[0]; var setDSt = _ds[1];

  /* Load persisted data + auth on mount */
  useEffect(function () {
    // Load saved briefing from localStorage first (instant)
    try {
      var saved = localStorage.getItem("fb_data");
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && parsed.data) {
          setData(parsed.data);
          if (parsed.headlines) setHeadlines(parsed.headlines);
          setRefreshed(new Date(parsed.time));
        }
      }
    } catch (e) {}
    // Then try KV (cross-device, may override)
    fetch("/api/store?key=briefing").then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.data) {
        setData(d.data);
        if (d.time) setRefreshed(new Date(d.time));
      }
    }).catch(function () {});
    // Load auth
    var auth = getAuthState();
    if (auth.ok) setAuthed(true);
    // Load webhook
    try { setWebhook(localStorage.getItem("fb_wh") || ""); } catch (e) {}
    // Session timer
    var t = setInterval(function () { setSess(getSessions()); }, 60000);
    return function () { clearInterval(t); };
  }, []);

  /* Save briefing to localStorage + KV whenever data changes */
  useEffect(function () {
    if (data) {
      var payload = { data: data, headlines: headlines, time: new Date().toISOString() };
      try {
        localStorage.setItem("fb_data", JSON.stringify(payload));
      } catch (e) {}
      // Also save to KV for cross-device
      fetch("/api/store?key=briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(function () {});
    }
  }, [data, headlines]);

  /* Auth functions */
  var tryLogin = function () {
    var auth = getAuthState();
    var now = Date.now();
    // Check lockout
    if (auth.lockedUntil > now) {
      var mins = Math.ceil((auth.lockedUntil - now) / 60000);
      setPwErr("Verrouillé. Réessaie dans " + mins + " min.");
      return;
    }
    if (checkPassword(pw)) {
      var newAuth = { ok: true, attempts: 0, lockedUntil: 0 };
      saveAuthState(newAuth);
      setAuthed(true);
      setPw("");
      setPwErr("");
      setShowPwForm(false);
    } else {
      var attempts = (auth.attempts || 0) + 1;
      var locked = attempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;
      var newAuth2 = { ok: false, attempts: attempts, lockedUntil: locked };
      saveAuthState(newAuth2);
      if (locked > 0) {
        setPwErr("Trop de tentatives. Verrouillé 30 min.");
      } else {
        setPwErr("Mot de passe incorrect (" + attempts + "/" + MAX_ATTEMPTS + ")");
      }
    }
    setPw("");
  };

  var logout = function () {
    var auth = getAuthState();
    auth.ok = false;
    saveAuthState(auth);
    setAuthed(false);
    setMenuOpen(false);
  };

  /* Webhook */
  var saveWh = function () {
    setWebhook(tmpWh);
    try { localStorage.setItem("fb_wh", tmpWh); } catch (e) {}
    setEditingWh(false);
  };

  /* Discord send */
  var sendDiscord = async function () {
    var url = ""; try { url = localStorage.getItem("fb_wh") || webhook; } catch (e) { url = webhook; }
    if (!url) return;
    setDSt("sending");
    try {
      var p = buildDiscord(data);
      if (!p) throw new Error("No data");
      var r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (!r.ok) throw new Error("" + r.status);
      setDSt("sent");
    } catch (e) { setDSt("error"); }
    setTimeout(function () { setDSt(null); }, 3000);
  };

  /* Scan */
  var scan = useCallback(async function () {
    setLoading(true); setError(null);

    var now = new Date();
    var ds = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var ts = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    /* ── STEP 1: Fetch RSS feeds (fast, 2-3s) ── */
    setStep("① Récupération des news...");
    var feedsData = null;
    var headlinesText = "";
    try {
      var feedResp = await fetch("/api/feeds");
      if (!feedResp.ok) throw new Error("Feeds " + feedResp.status);
      var feedJson = await feedResp.json();
      if (feedJson.error) throw new Error(feedJson.error);
      feedsData = feedJson.feeds || [];
      setHeadlines(feedsData);

      // Build text for Claude — titles only, compact
      var parts = [];
      for (var i = 0; i < feedsData.length; i++) {
        var titles = [];
        for (var j = 0; j < feedsData[i].items.length && j < 4; j++) {
          titles.push(feedsData[i].items[j]);
        }
        parts.push("[" + feedsData[i].tag + "] " + titles.join(" | "));
      }
      headlinesText = parts.join("\n");
    } catch (e) {
      // Continue without feeds - Claude will use its knowledge
      headlinesText = "(Flux RSS indisponibles)";
    }

    /* ── STEP 2: AI Analysis (Sonnet 4.6, 10-15s) ── */
    setStep("② Analyse en cours...");
    try {
      var userMsg = "Nous sommes le " + ds + ", " + ts + " CET (mars 2026). Morning briefing institutionnel NQ. AUCUN PRIX." +
        "\n\n===== FLUX RSS =====\n" + headlinesText;

      var resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMsg }]
        })
      });
      if (!resp.ok) { var et = ""; try { et = await resp.text(); } catch (x) {} throw new Error("Serveur " + resp.status + ": " + et.slice(0, 150)); }
      var txt = await resp.text();
      var result; try { result = JSON.parse(txt); } catch (pe) { throw new Error("Réponse non-JSON"); }
      if (result.error) throw new Error(typeof result.error === "string" ? result.error : result.error.message || "Erreur API");
      var full = "";
      var blocks = result.content || [];
      for (var k = 0; k < blocks.length; k++) { if (blocks[k].type === "text" && blocks[k].text) full += blocks[k].text; }
      if (!full) throw new Error("Réponse vide");
      var parsed = safeJSON(full);
      if (!parsed) throw new Error("JSON invalide");
      setData(parsed); setRefreshed(new Date()); setSess(getSessions());
      // Auto discord
      try { var h = localStorage.getItem("fb_wh"); if (h) setTimeout(function () { sendDiscord(); }, 500); } catch (ae) {}
    } catch (e) { setError(e.message || "Erreur"); }
    setLoading(false); setStep("");
    setMenuOpen(false);
  }, [data, webhook]);

  var sc = function (s) { return s === "live" ? "#00e676" : s === "soon" ? "#ffa726" : s === "done" ? "#555" : "#687088"; };
  var hasData = data !== null;

  /* ═══ RENDER ═══ */
  return (
    <div className="root">
      <style>{STYLES}</style>

      {/* TV TICKER */}
      <div className="tv-tape">
        <TVWidget src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js" config={{
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
          showSymbolLogo: true, isTransparent: true, displayMode: "adaptive", colorTheme: "dark", locale: "fr"
        }} />
      </div>

      {/* HEADER */}
      <header className="hdr">
        <div className="logo">
          <div className="lm">⚡</div>
          <div><div className="lt">FLOW BRIEFING</div><div className="ls">Institutional Morning Desk</div></div>
        </div>
        <div className="acts">
          {refreshed && <span className="tb">{refreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — {refreshed.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
          <button className="btn bg gear-btn" onClick={function () { if (authed) { setMenuOpen(!menuOpen); } else { setShowPwForm(!showPwForm); } }}>
            {authed ? "◆" : "⚙"}
          </button>
        </div>
      </header>

      {/* PASSWORD FORM (non-authed) */}
      {showPwForm && !authed && (
        <div className="pw-bar fade">
          <div className="pw-inner">
            <input className="pw-input" type="password" placeholder="Mot de passe admin..." value={pw}
              onChange={function (e) { setPw(e.target.value); }}
              onKeyDown={function (e) { if (e.key === "Enter") tryLogin(); }}
            />
            <button className="btn bp pw-btn" onClick={tryLogin}>→</button>
          </div>
          {pwErr && <div className="pw-err">{pwErr}</div>}
        </div>
      )}

      {/* ADMIN MENU (authed) */}
      {menuOpen && authed && (
        <div className="admin-menu fade">
          <div className="am-header">
            <span className="am-title">◆ ADMIN PANEL</span>
            <button className="am-close" onClick={function () { setMenuOpen(false); }}>✕</button>
          </div>

          <div className="am-section">
            <div className="am-label">ACTIONS</div>
            <button className={"am-btn am-btn-primary" + (loading ? " am-disabled" : "")} onClick={scan} disabled={loading}>
              {loading ? "◌ Scan en cours..." : "↻ Nouveau Briefing"}
            </button>
            {data && (
              <button className="am-btn am-btn-discord" onClick={sendDiscord}>
                {dSt === "sending" ? "◌ Envoi..." : dSt === "sent" ? "✓ Envoyé !" : "📨 Envoyer sur Discord"}
              </button>
            )}
          </div>

          <div className="am-section">
            <div className="am-label">WEBHOOK DISCORD</div>
            {!editingWh ? (
              <div className="am-wh-row">
                <span className="am-wh-val">{webhook ? webhook.slice(0, 45) + "..." : "Non configuré"}</span>
                <button className="am-btn-sm" onClick={function () { setTmpWh(webhook); setEditingWh(true); }}>Modifier</button>
              </div>
            ) : (
              <div>
                <input className="am-input" value={tmpWh} onChange={function (e) { setTmpWh(e.target.value); }} placeholder="https://discord.com/api/webhooks/..." />
                <div className="am-wh-actions">
                  <button className="am-btn-sm" onClick={function () { setEditingWh(false); }}>Annuler</button>
                  <button className="am-btn-sm am-btn-sm-primary" onClick={saveWh}>Sauvegarder</button>
                </div>
              </div>
            )}
          </div>

          <div className="am-section am-footer-section">
            <button className="am-btn-logout" onClick={logout}>Déconnexion</button>
            <span className="am-info">Sonnet 4 · ~$0.03/scan</span>
          </div>
        </div>
      )}

      {/* PROGRESS */}
      {step && <div className="prog"><span className="dot">●</span> {step}</div>}

      {/* TOAST */}
      {dSt && <div className={"toast " + dSt}>{dSt === "sending" ? "📨 Envoi..." : dSt === "sent" ? "✓ Envoyé" : "✗ Erreur webhook"}</div>}

      {/* ERROR */}
      {error && !loading && <div className="err">⚠ {error}</div>}

      {/* EMPTY (no saved data either) */}
      {!hasData && !loading && (
        <div className="empty">
          <div className="ei">⚡</div>
          <h2 className="eh">FLOW BRIEFING</h2>
          <p className="ep">Aucun briefing disponible.<br />Le prochain scan affichera l'analyse ici.</p>
          <div className="sp">{sess.filter(function (s) { return s.st !== "done"; }).slice(0, 4).map(function (s, i) {
            return <div key={i} className="schip" style={{ borderColor: sc(s.st), color: sc(s.st) }}>{s.name} <b>{s.lb}</b></div>;
          })}</div>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="ct">
          <div className="sk" style={{ height: 120, marginBottom: 14 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}><div className="sk" style={{ height: 70 }} /><div className="sk" style={{ height: 70 }} /></div>
          <div className="sk" style={{ height: 50, marginBottom: 6 }} />
          <div className="sk" style={{ height: 50, marginBottom: 6 }} />
        </div>
      )}

      {/* ═══ DATA ═══ */}
      {hasData && !loading && (
        <div className="ct">

          <div className="sb">{sess.map(function (s, i) {
            return <div key={i} className="si" style={{ opacity: s.st === "done" ? 0.4 : 1 }}>
              <div className="sd" style={{ background: sc(s.st) }} /><div className="sn">{s.name}</div><div className="stm">{s.tm} CET</div><div className="slb" style={{ color: sc(s.st) }}>{s.lb}</div>
            </div>;
          })}</div>

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

          {data.week_summary && <div className="abox fade ab-green"><div className="alab">📋 RÉSUMÉ SEMAINE</div><p className="atxt">{data.week_summary}</p></div>}

          <div className="arow">
            {data.flows && <div className="abox fade ab-cyan"><div className="alab">💰 FLUX INSTITUTIONNELS</div><p className="atxt">{data.flows}</p></div>}
            {data.intermarket && <div className="abox fade ab-orange"><div className="alab">🔗 INTERMARCHÉ</div><p className="atxt">{data.intermarket}</p></div>}
          </div>

          {data.session_plan && <div className="abox fade ab-pink"><div className="alab">📅 PLAN DE SESSION</div><p className="atxt">{data.session_plan}</p></div>}

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

          <div style={{ marginTop: 24 }}>
            <div className="sec">📅 CALENDRIER ÉCONOMIQUE</div>
            <div className="tv-cal">
              <TVWidget src="https://s3.tradingview.com/external-embedding/embed-widget-events.js" config={{ colorTheme: "dark", isTransparent: true, width: "100%", height: "400", locale: "fr", importanceFilter: "0,1", countryFilter: "us,eu,gb,jp" }} />
            </div>
          </div>
        </div>
      )}

      <footer className="ft"><span>FLOW BRIEFING · Institutional NQ Desk</span><span>TradingView · Investing.com · Claude Sonnet</span></footer>
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

  /* Header */
  ".hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 28px;border-bottom:1px solid var(--bd);background:rgba(6,8,16,.92);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}",
  ".logo{display:flex;align-items:center;gap:14px}.lm{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.03));border:1px solid rgba(0,212,255,.2);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--c)}.lt{font-family:var(--m);font-size:14px;font-weight:700;color:#fff;letter-spacing:2.5px}.ls{font-size:10px;color:var(--t3);letter-spacing:.5px;margin-top:1px}",
  ".acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.tb{font-family:var(--m);font-size:10px;color:var(--t3)}",
  ".btn{font-family:var(--m);font-size:11px;font-weight:500;padding:7px 18px;border-radius:6px;cursor:pointer;transition:all .15s;border:none;letter-spacing:.3px}",
  ".bp{background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);color:var(--c)}.bp:hover{background:rgba(0,212,255,.15)}",
  ".bg{background:transparent;border:1px solid var(--bd);color:var(--t2);padding:7px 12px}.bg:hover{border-color:var(--bd2);color:var(--tx)}",
  ".gear-btn{font-size:13px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:0;border-radius:8px;transition:all .2s}",
  ".gear-btn:hover{background:rgba(0,212,255,.08);border-color:rgba(0,212,255,.2);color:var(--c);transform:rotate(15deg)}",

  /* Password bar */
  ".pw-bar{padding:12px 28px;background:var(--bg2);border-bottom:1px solid var(--bd);display:flex;flex-direction:column;gap:6px}",
  ".pw-inner{display:flex;gap:8px;align-items:center;max-width:400px}",
  ".pw-input{flex:1;padding:8px 14px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-family:var(--m);font-size:12px;outline:none}.pw-input:focus{border-color:rgba(0,212,255,.3)}",
  ".pw-btn{padding:8px 16px}",
  ".pw-err{font-family:var(--m);font-size:10px;color:var(--r)}",

  /* Admin menu */
  ".admin-menu{position:absolute;top:60px;right:20px;width:360px;max-width:calc(100vw - 40px);background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;z-index:60;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}",
  ".am-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)}",
  ".am-title{font-family:var(--m);font-size:12px;font-weight:600;color:var(--c);letter-spacing:1.5px}",
  ".am-close{background:none;border:none;color:var(--t3);font-size:16px;cursor:pointer;padding:4px 8px;border-radius:4px;transition:all .15s}.am-close:hover{color:var(--tx);background:rgba(255,255,255,.05)}",
  ".am-section{padding:16px 20px;border-bottom:1px solid var(--bd)}",
  ".am-label{font-family:var(--m);font-size:9px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:10px}",
  ".am-btn{display:block;width:100%;padding:10px 16px;margin-bottom:6px;border:1px solid var(--bd);background:transparent;color:var(--tx);font-family:var(--m);font-size:11px;font-weight:500;border-radius:7px;cursor:pointer;transition:all .15s;text-align:left}",
  ".am-btn:hover{background:rgba(255,255,255,.03);border-color:var(--bd2)}",
  ".am-btn-primary{border-color:rgba(0,212,255,.2);color:var(--c)}.am-btn-primary:hover{background:rgba(0,212,255,.08)}",
  ".am-btn-discord{border-color:rgba(88,101,242,.25);color:#7289da}.am-btn-discord:hover{background:rgba(88,101,242,.08)}",
  ".am-disabled{opacity:.4;cursor:default}",
  ".am-wh-row{display:flex;justify-content:space-between;align-items:center;gap:8px}",
  ".am-wh-val{font-family:var(--m);font-size:10px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}",
  ".am-input{width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:6px;color:var(--tx);font-family:var(--m);font-size:10px;outline:none;margin-bottom:8px}.am-input:focus{border-color:rgba(0,212,255,.3)}",
  ".am-wh-actions{display:flex;gap:6px;justify-content:flex-end}",
  ".am-btn-sm{background:transparent;border:1px solid var(--bd);color:var(--t2);font-family:var(--m);font-size:10px;padding:5px 12px;border-radius:5px;cursor:pointer;transition:all .15s}.am-btn-sm:hover{border-color:var(--bd2);color:var(--tx)}",
  ".am-btn-sm-primary{border-color:rgba(0,212,255,.2);color:var(--c)}.am-btn-sm-primary:hover{background:rgba(0,212,255,.08)}",
  ".am-footer-section{display:flex;justify-content:space-between;align-items:center;border-bottom:none}",
  ".am-btn-logout{background:transparent;border:1px solid rgba(255,82,82,.15);color:var(--r);font-family:var(--m);font-size:10px;padding:5px 14px;border-radius:5px;cursor:pointer;transition:all .15s}.am-btn-logout:hover{background:rgba(255,82,82,.05)}",
  ".am-info{font-family:var(--m);font-size:9px;color:var(--t3)}",

  /* Progress */
  ".prog{padding:10px 28px;font-family:var(--m);font-size:11px;color:var(--c);background:rgba(0,212,255,.02);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px}",
  "@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}.dot{animation:blink 1s infinite;font-size:8px}",

  /* Empty */
  ".empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;text-align:center;padding:48px 24px}.ei{font-size:44px;opacity:.12;margin-bottom:28px}.eh{font-family:var(--m);font-size:20px;color:#fff;letter-spacing:2px;margin-bottom:10px;font-weight:700}.ep{font-size:13px;color:var(--t3);max-width:420px;line-height:1.7;margin-bottom:24px}",
  ".sp{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:28px}.schip{font-family:var(--m);font-size:10px;padding:5px 12px;border:1px solid;border-radius:5px;display:flex;gap:6px}",

  /* Error */
  ".err{margin:16px 28px;padding:16px;background:rgba(255,82,82,.05);border:1px solid rgba(255,82,82,.12);border-radius:10px;color:var(--r);font-size:12px;text-align:center}",

  /* Skeleton */
  "@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.sk{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}",

  /* Content */
  ".ct{padding:20px 28px 48px;max-width:1200px;margin:0 auto}",

  /* Sessions */
  ".sb{display:flex;gap:5px;margin-bottom:20px;overflow-x:auto;padding-bottom:2px}.si{flex:1;min-width:85px;background:var(--bg2);border:1px solid var(--bd);border-radius:7px;padding:8px 10px;text-align:center}.sd{width:7px;height:7px;border-radius:50%;margin:0 auto 4px}.sn{font-size:9px;color:var(--t2);font-weight:500}.stm{font-family:var(--m);font-size:8px;color:var(--t3);margin-top:1px}.slb{font-family:var(--m);font-size:10px;font-weight:700;margin-top:3px}",

  /* Verdict */
  ".vc{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:24px 28px;margin-bottom:20px;position:relative;overflow:hidden}.vc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.vc.bull::before{background:linear-gradient(90deg,transparent,var(--g),transparent)}.vc.bear::before{background:linear-gradient(90deg,transparent,var(--r),transparent)}.vc.neu::before{background:linear-gradient(90deg,transparent,var(--o),transparent)}",
  ".vh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px}.vbias{font-family:var(--m);font-size:22px;font-weight:700;letter-spacing:3px}.vtit{font-size:14px;color:var(--t2);margin-top:4px;font-weight:500;font-style:italic}.vconf{font-family:var(--m);font-size:11px;padding:4px 14px;border-radius:5px;font-weight:600;border:1px solid}",
  ".vsum{font-size:14px;line-height:1.8;margin-bottom:16px;color:#dde}",
  ".vscs{display:grid;grid-template-columns:1fr 1fr;gap:12px}.vsc{background:rgba(255,255,255,.012);border:1px solid var(--bd);border-radius:8px;padding:14px 16px}.vscl{font-family:var(--m);font-size:11px;font-weight:700;margin-bottom:8px;letter-spacing:.5px}.vsct{font-size:12px;color:var(--t2);line-height:1.6}",

  /* Analysis */
  ".arow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}",
  ".abox{background:var(--bg2);border:1px solid var(--bd);border-radius:0 10px 10px 0;padding:16px 20px;margin-bottom:12px}.ab-cyan{border-left:2px solid var(--c)}.ab-orange{border-left:2px solid var(--o)}.ab-pink{border-left:2px solid var(--pk)}.ab-green{border-left:2px solid var(--gn)}",
  ".alab{font-family:var(--m);font-size:10px;font-weight:600;color:var(--t3);letter-spacing:1.5px;margin-bottom:8px}.atxt{font-size:12px;line-height:1.7;color:var(--t2)}",

  ".sec{font-family:var(--m);font-size:11px;font-weight:600;color:var(--t3);letter-spacing:2px;margin:20px 0 12px;display:flex;align-items:center;gap:8px}",

  /* News */
  ".nl{display:flex;flex-direction:column;gap:4px}.ni{padding:12px 16px;background:var(--bg2);border-left:3px solid var(--bd);border-radius:0 8px 8px 0;transition:all .12s}.ni:hover{background:var(--bg3);transform:translateX(3px)}",
  ".nh{display:flex;align-items:center;gap:10px;margin-bottom:6px}.nimp{font-family:var(--m);font-size:9px;font-weight:700;letter-spacing:.5px;flex-shrink:0}.nti{font-size:13px;font-weight:600;color:#eee;flex:1}.nbias{font-family:var(--m);font-size:10px;font-weight:700;flex-shrink:0}.ndet{font-size:11px;color:var(--t2);line-height:1.5}",

  ".tv-cal{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;overflow:hidden;min-height:400px}.tv-cal .tradingview-widget-copyright{display:none!important}",

  /* RSS Feeds */
  ".feeds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;margin-bottom:16px}",
  ".feed-card{background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:12px 14px;overflow:hidden}",
  ".feed-tag{font-family:var(--m);font-size:9px;font-weight:700;color:var(--c);letter-spacing:1.5px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--bd)}",
  ".feed-item{padding:5px 0;border-bottom:1px solid rgba(255,255,255,.02)}",
  ".feed-item:last-child{border-bottom:none}",
  ".feed-title{font-size:11px;font-weight:500;color:#ccd;line-height:1.4}",
  ".feed-desc{font-size:10px;color:var(--t3);line-height:1.3;margin-top:2px}",

  "@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeUp .3s ease both}",

  ".ft{padding:16px 28px;border-top:1px solid var(--bd);display:flex;justify-content:space-between;font-family:var(--m);font-size:9px;color:var(--t3);letter-spacing:.5px}",
  ".toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-family:var(--m);font-size:11px;z-index:200;animation:fadeUp .3s ease;border:1px solid}.sending{background:rgba(88,101,242,.15);border-color:rgba(88,101,242,.3);color:#7289da}.sent{background:rgba(0,230,118,.1);border-color:rgba(0,230,118,.2);color:var(--g)}.error{background:rgba(255,82,82,.08);border-color:rgba(255,82,82,.15);color:var(--r)}",

  "@media(max-width:768px){.vscs{grid-template-columns:1fr}.arow{grid-template-columns:1fr}.ct{padding:16px}.sb{flex-wrap:wrap}.admin-menu{right:10px;width:calc(100vw - 20px)}}",
  "::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}"
].join("\n");
