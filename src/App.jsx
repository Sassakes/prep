import { useState, useCallback, useEffect } from "react";

var SYMBOL_MAP = {
  "NQ=F": { name: "NQ (Nasdaq)", cat: "index" },
  "ES=F": { name: "ES (S&P 500)", cat: "index" },
  "RTY=F": { name: "RTY (Russell)", cat: "index" },
  "YM=F": { name: "YM (Dow)", cat: "index" },
  "GC=F": { name: "Gold", cat: "commodity" },
  "CL=F": { name: "WTI Crude", cat: "commodity" },
  "DX-Y.NYB": { name: "DXY", cat: "forex" },
  "^VIX": { name: "VIX", cat: "volatility" },
  "^TNX": { name: "10Y Yield", cat: "bond" },
  "EURUSD=X": { name: "EUR/USD", cat: "forex" },
  "GBPUSD=X": { name: "GBP/USD", cat: "forex" },
  "USDJPY=X": { name: "USD/JPY", cat: "forex" },
};

var ANALYSIS_PROMPT = "Tu es un analyste macro senior pour un scalper de volatilité sur NQ. Voici les données marché RÉELLES en temps réel. Analyse-les et donne ton verdict.\n\nRÉPONDS UNIQUEMENT en JSON valide. Aucun texte hors JSON.\n\n{\n  \"verdict\": {\n    \"bias\": \"BULLISH|BEARISH|NEUTRE\",\n    \"confidence\": \"HIGH|MEDIUM|LOW\",\n    \"summary\": \"3-5 phrases. Analyse les moves, les corrélations intermarché (DXY vs NQ, yields vs equity, VIX level), et donne des niveaux/triggers concrets pour scalp NQ.\",\n    \"key_levels_nq\": \"R2:XXXXX R1:XXXXX | Pivot:XXXXX | S1:XXXXX S2:XXXXX\",\n    \"scenarios\": [\n      {\"label\":\"Scénario BULL\",\"probability\":\"XX%\",\"trigger\":\"condition\",\"target\":\"XXXXX\",\"description\":\"explication\"},\n      {\"label\":\"Scénario BEAR\",\"probability\":\"XX%\",\"trigger\":\"condition\",\"target\":\"XXXXX\",\"description\":\"explication\"}\n    ]\n  },\n  \"flow_analysis\": \"Analyse des flux: où va l'argent (risk-on/off, rotation sectors, bonds vs equity, dollar strength/weakness). 3-4 phrases.\",\n  \"key_correlations\": \"Corrélations clés observées dans les données: DXY vs NQ, VIX level, yields, oil. 2-3 phrases.\",\n  \"session_outlook\": \"Outlook pour la session US Open/London. Volatilité attendue, niveaux à surveiller, catalysts. 2-3 phrases.\"\n}\n\nSois CONCRET et CHIFFRÉ. Utilise les vrais prix fournis.";

function wait(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function getSessionCountdowns() {
  var now = new Date();
  var sessions = [
    { name: "London Open", h: 9, m: 0 },
    { name: "EU Overlap", h: 14, m: 0 },
    { name: "US Data", h: 14, m: 30 },
    { name: "US Open", h: 15, m: 30 },
    { name: "Power Hour", h: 21, m: 0 },
    { name: "US Close", h: 22, m: 0 },
  ];
  var cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  var cetTotal = cet.getHours() * 60 + cet.getMinutes();
  return sessions.map(function (s) {
    var sTotal = s.h * 60 + s.m;
    var diff = sTotal - cetTotal;
    var status = "upcoming";
    var label = "";
    if (diff < -30) { status = "passed"; label = "Terminé"; }
    else if (diff < 0) { status = "active"; label = "EN COURS"; }
    else if (diff < 60) { status = "soon"; label = diff + "min"; }
    else { label = Math.floor(diff / 60) + "h" + String(diff % 60).padStart(2, "0"); }
    return { name: s.name, status: status, label: label, time: String(s.h).padStart(2, "0") + ":" + String(s.m).padStart(2, "0") + " CET" };
  });
}

function buildDiscordPayload(quotes, analysis) {
  var v = analysis ? analysis.verdict : null;
  var color = 0xffa726;
  var emoji = "🟡";
  if (v && v.bias === "BULLISH") { color = 0x00e676; emoji = "🟢"; }
  if (v && v.bias === "BEARISH") { color = 0xff5252; emoji = "🔴"; }
  var quotesText = quotes.map(function (q) {
    var info = SYMBOL_MAP[q.symbol] || { name: q.symbol };
    var arrow = q.changePct >= 0 ? "▲" : "▼";
    var pct = (q.changePct >= 0 ? "+" : "") + q.changePct.toFixed(2) + "%";
    return arrow + " **" + info.name + "** " + q.price.toFixed(2) + " (" + pct + ")";
  }).join("\n");
  var now = new Date();
  var dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  var embeds = [
    { title: "🔥 Données Marché Live", description: quotesText.slice(0, 1024), color: 0x1a1a2e },
  ];
  if (v) {
    embeds.unshift({
      title: emoji + " VERDICT: " + v.bias + " (Conf: " + v.confidence + ")",
      description: (v.summary || "—").slice(0, 1024),
      color: color,
      fields: [
        { name: "🎯 Niveaux NQ", value: (v.key_levels_nq || "—").slice(0, 200), inline: false },
      ],
      footer: { text: "Flow Briefing" },
      timestamp: now.toISOString(),
    });
  }
  if (analysis && analysis.flow_analysis) {
    embeds.push({ title: "💰 Analyse des Flux", description: analysis.flow_analysis.slice(0, 1024), color: 0x00d4ff });
  }
  if (analysis && analysis.session_outlook) {
    embeds.push({ title: "📅 Outlook Session", description: analysis.session_outlook.slice(0, 1024), color: 0xf472b6 });
  }
  return { content: "# ⚡ FLOW BRIEFING — " + dateStr.toUpperCase(), embeds: embeds };
}

export default function App() {
  var _s = useState(null), quotes = _s[0], setQuotes = _s[1];
  var _a = useState(null), analysis = _a[0], setAnalysis = _a[1];
  var _l1 = useState(false), loadingQuotes = _l1[0], setLoadingQuotes = _l1[1];
  var _l2 = useState(false), loadingAnalysis = _l2[0], setLoadingAnalysis = _l2[1];
  var _e1 = useState(null), errorQuotes = _e1[0], setErrorQuotes = _e1[1];
  var _e2 = useState(null), errorAnalysis = _e2[0], setErrorAnalysis = _e2[1];
  var _sh = useState(false), showSettings = _sh[0], setShowSettings = _sh[1];
  var _wh = useState(""), webhook = _wh[0], setWebhook = _wh[1];
  var _tw = useState(""), tempWebhook = _tw[0], setTempWebhook = _tw[1];
  var _ad = useState(false), autoDiscord = _ad[0], setAutoDiscord = _ad[1];
  var _ta = useState(false), tempAuto = _ta[0], setTempAuto = _ta[1];
  var _ds = useState(null), discordStatus = _ds[0], setDiscordStatus = _ds[1];
  var _lr = useState(null), lastRefresh = _lr[0], setLastRefresh = _lr[1];
  var _st = useState(""), step = _st[0], setStep = _st[1];
  var _ss = useState([]), sessions = _ss[0], setSessions = _ss[1];

  useEffect(function () {
    try {
      setWebhook(localStorage.getItem("flow_webhook") || "");
      setAutoDiscord(localStorage.getItem("flow_auto_discord") === "true");
    } catch (e) {}
    setSessions(getSessionCountdowns());
    var t = setInterval(function () { setSessions(getSessionCountdowns()); }, 60000);
    return function () { clearInterval(t); };
  }, []);

  var openSettings = function () { setTempWebhook(webhook); setTempAuto(autoDiscord); setShowSettings(true); };
  var saveSettings = function () {
    setWebhook(tempWebhook); setAutoDiscord(tempAuto);
    try { localStorage.setItem("flow_webhook", tempWebhook); localStorage.setItem("flow_auto_discord", tempAuto.toString()); } catch (e) {}
    setShowSettings(false);
  };

  var sendDiscord = async function (q, a) {
    var hook = webhook || "";
    try { hook = localStorage.getItem("flow_webhook") || hook; } catch (e) {}
    if (!hook) return;
    setDiscordStatus("sending");
    try {
      var payload = buildDiscordPayload(q || quotes || [], a || analysis);
      var r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("Discord " + r.status);
      setDiscordStatus("sent");
      setTimeout(function () { setDiscordStatus(null); }, 3000);
    } catch (e) {
      setDiscordStatus("error");
      setTimeout(function () { setDiscordStatus(null); }, 4000);
    }
  };

  var fetchBriefing = useCallback(async function () {
    setQuotes(null); setAnalysis(null);
    setErrorQuotes(null); setErrorAnalysis(null);
    var q = null;
    var a = null;

    // STEP 1: Fetch real market data (free, instant)
    setLoadingQuotes(true);
    setStep("① Récupération données marché (Yahoo Finance)...");
    try {
      var resp = await fetch("/api/markets");
      var text = await resp.text();
      var data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      q = data.quotes || [];
      setQuotes(q);
    } catch (e) {
      setErrorQuotes(e.message);
    }
    setLoadingQuotes(false);

    if (!q || q.length === 0) {
      setStep("");
      setLastRefresh(new Date());
      return;
    }

    // STEP 2: AI Analysis (Claude, no web search = fast ~5s)
    setLoadingAnalysis(true);
    setStep("② Analyse IA des données...");
    await wait(2000);
    try {
      var quotesStr = q.map(function (item) {
        var info = SYMBOL_MAP[item.symbol] || { name: item.symbol };
        var pct = (item.changePct >= 0 ? "+" : "") + item.changePct.toFixed(2) + "%";
        return info.name + ": " + item.price.toFixed(2) + " (" + pct + ") H:" + item.high.toFixed(2) + " L:" + item.low.toFixed(2);
      }).join("\n");
      var now = new Date();
      var userMsg = "Données marché live (" + now.toLocaleDateString("fr-FR") + " " + now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + " CET):\n\n" + quotesStr + "\n\nAnalyse ces données pour un scalper NQ.";

      var resp2 = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: ANALYSIS_PROMPT,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      var text2 = await resp2.text();
      var result = JSON.parse(text2);
      if (result.error) throw new Error(result.error.message || result.error);
      var fullText = "";
      var blocks = result.content || [];
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "text" && blocks[i].text) fullText += blocks[i].text;
      }
      var cleaned = fullText.replace(/```json|```/g, "").trim();
      var match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        a = JSON.parse(match[0]);
        setAnalysis(a);
      }
    } catch (e) {
      setErrorAnalysis(e.message);
    }
    setLoadingAnalysis(false);

    setStep("");
    setLastRefresh(new Date());
    setSessions(getSessionCountdowns());

    try {
      var hook = localStorage.getItem("flow_webhook") || "";
      var auto = localStorage.getItem("flow_auto_discord") === "true";
      if (hook && auto) setTimeout(function () { sendDiscord(q, a); }, 500);
    } catch (e) {}
  }, []);

  var isLoading = loadingQuotes || loadingAnalysis;
  var hasData = quotes || analysis;
  var sc = function (s) { return s === "active" ? "#00e676" : s === "soon" ? "#ffa726" : s === "passed" ? "#333" : "#555"; };

  return (
    <div className="root">
      <style>{CSS}</style>

      <header className="header">
        <div className="logo-area">
          <div className="logo-mark">⚡</div>
          <div><div className="logo-text">FLOW BRIEFING</div><div className="logo-sub">Live Data · AI Analysis · Flux</div></div>
        </div>
        <div className="header-actions">
          {lastRefresh && <span className="time-badge">MàJ {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
          {hasData && webhook && <button className="btn btn-discord" onClick={function () { sendDiscord(); }}>{discordStatus === "sending" ? "◌..." : "📨 Discord"}</button>}
          <button className="btn btn-ghost" onClick={openSettings}>⚙</button>
          <button className="btn btn-primary" onClick={fetchBriefing} disabled={isLoading}>{isLoading ? "◌ Scan..." : "↻ Scanner"}</button>
        </div>
      </header>

      {step && <div className="progress-bar"><span className="pdot">●</span> {step}</div>}

      {showSettings && (
        <div className="modal-overlay" onClick={function () { setShowSettings(false); }}>
          <div className="modal" onClick={function (e) { e.stopPropagation(); }}>
            <h3>⚙ PARAMÈTRES</h3>
            <label>Webhook Discord</label>
            <input className="modal-input" type="text" placeholder="https://discord.com/api/webhooks/..." value={tempWebhook} onChange={function (e) { setTempWebhook(e.target.value); }} />
            <div className="toggle-row">
              <button className={"toggle" + (tempAuto ? " on" : "")} onClick={function () { setTempAuto(!tempAuto); }} />
              <span className="toggle-label">Envoyer auto sur Discord après chaque scan</span>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={function () { setShowSettings(false); }}>Annuler</button>
              <button className="btn btn-primary" onClick={saveSettings}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {discordStatus && (
        <div className={"toast " + discordStatus}>
          {discordStatus === "sending" && "📨 Envoi..."}{discordStatus === "sent" && "✓ Envoyé"}{discordStatus === "error" && "✗ Erreur webhook"}
        </div>
      )}

      {!hasData && !isLoading && (
        <div className="empty">
          <div className="empty-icon">⚡</div>
          <h2>FLOW BRIEFING</h2>
          <p>Données marché live (Yahoo Finance) + Analyse IA (Claude).<br />Résultats en 2 étapes, ~10 secondes.</p>
          {sessions.length > 0 && (
            <div className="sp">{sessions.filter(function (s) { return s.status !== "passed"; }).slice(0, 4).map(function (s, i) {
              return <div key={i} className="schip" style={{ borderColor: sc(s.status), color: sc(s.status) }}>{s.name} <b>{s.label}</b></div>;
            })}</div>
          )}
          <button className="btn-start" onClick={fetchBriefing}>Scanner les marchés</button>
          <div className="cost-note">Coût: ~$0.005/scan · Données: Yahoo Finance (gratuit)</div>
        </div>
      )}

      {(hasData || isLoading) && (
        <div className="content">

          {sessions.length > 0 && (
            <div className="sbar">{sessions.map(function (s, i) {
              return <div key={i} className="sitem" style={{ opacity: s.status === "passed" ? 0.3 : 1 }}>
                <div className="sdot" style={{ background: sc(s.status) }} />
                <div className="sname">{s.name}</div>
                <div className="stime">{s.time}</div>
                <div className="scount" style={{ color: sc(s.status) }}>{s.label}</div>
              </div>;
            })}</div>
          )}

          {/* AI VERDICT */}
          {loadingAnalysis && !analysis && <div className="skel" style={{ height: 140, marginBottom: 16 }} />}
          {errorAnalysis && <div className="ebox">⚠ Analyse: {errorAnalysis}</div>}
          {analysis && analysis.verdict && (
            <div className={"vcard fade " + (analysis.verdict.bias === "BULLISH" ? "bull" : analysis.verdict.bias === "BEARISH" ? "bear" : "neutral")}>
              <div className="vheader">
                <div className="vbias" style={{ color: analysis.verdict.bias === "BULLISH" ? "var(--green)" : analysis.verdict.bias === "BEARISH" ? "var(--red)" : "var(--orange)" }}>
                  {analysis.verdict.bias === "BULLISH" ? "▲ " : analysis.verdict.bias === "BEARISH" ? "▼ " : "— "}{analysis.verdict.bias}
                </div>
                <div className="vconf" style={{
                  background: analysis.verdict.confidence === "HIGH" ? "rgba(0,230,118,0.1)" : "rgba(255,167,38,0.1)",
                  color: analysis.verdict.confidence === "HIGH" ? "var(--green)" : "var(--orange)",
                  border: "1px solid " + (analysis.verdict.confidence === "HIGH" ? "rgba(0,230,118,0.2)" : "rgba(255,167,38,0.2)")
                }}>CONF: {analysis.verdict.confidence}</div>
              </div>
              <p className="vsummary">{analysis.verdict.summary}</p>
              {analysis.verdict.key_levels_nq && <div className="vlevels">🎯 {analysis.verdict.key_levels_nq}</div>}
              {analysis.verdict.scenarios && analysis.verdict.scenarios.length > 0 && (
                <div className="scenarios">{analysis.verdict.scenarios.map(function (s, i) {
                  return <div key={i} className="scenario">
                    <div className="schead"><span className="sclabel" style={{ color: s.label.includes("BULL") ? "var(--green)" : "var(--red)" }}>{s.label}</span><span className="scprob">{s.probability}</span></div>
                    <div className="sctrigger">▸ Trigger: {s.trigger}</div>
                    <div className="sctarget">▸ Target: {s.target}</div>
                    <div className="scdesc">{s.description}</div>
                  </div>;
                })}</div>
              )}
            </div>
          )}

          {analysis && analysis.flow_analysis && (
            <div className="infobox cyan fade"><div className="plabel">💰 ANALYSE DES FLUX</div><p>{analysis.flow_analysis}</p></div>
          )}
          {analysis && analysis.key_correlations && (
            <div className="infobox orange fade"><div className="plabel">🔗 CORRÉLATIONS</div><p>{analysis.key_correlations}</p></div>
          )}
          {analysis && analysis.session_outlook && (
            <div className="infobox pink fade"><div className="plabel">📅 OUTLOOK SESSION</div><p>{analysis.session_outlook}</p></div>
          )}

          {/* MARKET DATA */}
          {loadingQuotes && !quotes && (
            <div className="qgrid">{[1,2,3,4,5,6,7,8].map(function (i) { return <div key={i} className="skel" style={{ height: 80 }} />; })}</div>
          )}
          {errorQuotes && <div className="ebox">⚠ Données: {errorQuotes}</div>}
          {quotes && quotes.length > 0 && (
            <div>
              <div className="stitle"><span style={{ color: "var(--orange)" }}>●</span> DONNÉES MARCHÉ LIVE</div>
              <div className="qgrid">{quotes.map(function (q, i) {
                var info = SYMBOL_MAP[q.symbol] || { name: q.symbol, cat: "other" };
                var isUp = q.changePct >= 0;
                var pct = (isUp ? "+" : "") + q.changePct.toFixed(2) + "%";
                var catColor = info.cat === "index" ? "#00e5ff" : info.cat === "commodity" ? "#fbbf24" : info.cat === "forex" ? "#a78bfa" : info.cat === "bond" ? "#34d399" : info.cat === "volatility" ? "#ff5252" : "#888";
                return <div key={i} className="qcard fade" style={{ animationDelay: i * 30 + "ms", borderTop: "2px solid " + catColor }}>
                  <div className="qtop">
                    <span className="qname">{info.name}</span>
                    <span className="qpct" style={{ color: isUp ? "var(--green)" : "var(--red)" }}>{pct}</span>
                  </div>
                  <div className="qprice">{q.price.toFixed(2)}</div>
                  <div className="qrange">L: {q.low.toFixed(2)} — H: {q.high.toFixed(2)}</div>
                  <div className="qchange" style={{ color: isUp ? "var(--green)" : "var(--red)" }}>
                    {isUp ? "▲" : "▼"} {Math.abs(q.change).toFixed(2)} pts
                  </div>
                </div>;
              })}</div>
            </div>
          )}
        </div>
      )}

      <footer className="footer"><span>FLOW BRIEFING · NQ SCALPER</span><span>Yahoo Finance + Claude Haiku · ~$0.005/scan</span></footer>
    </div>
  );
}

var CSS = "\n@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');\n:root{--bg:#07080c;--bg2:#0c0e14;--bg3:#12151e;--border:#1a1e2e;--border2:#252a3a;--text:#c4c8d4;--text2:#6b7084;--text3:#3d4156;--cyan:#00d4ff;--green:#00e676;--red:#ff5252;--orange:#ffa726;--pink:#f472b6;--mono:'IBM Plex Mono',monospace;--sans:'DM Sans',sans-serif}\n*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg)}\n.root{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh}\n.header{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid var(--border);background:rgba(7,8,12,0.95);backdrop-filter:blur(12px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}\n.logo-area{display:flex;align-items:center;gap:12px}.logo-mark{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,212,255,0.05));border:1px solid rgba(0,212,255,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--cyan)}.logo-text{font-family:var(--mono);font-size:13px;font-weight:600;color:#fff;letter-spacing:2px}.logo-sub{font-size:10px;color:var(--text3);margin-top:1px}\n.header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.time-badge{font-family:var(--mono);font-size:10px;color:var(--text3)}\n.btn{font-family:var(--mono);font-size:11px;font-weight:500;padding:7px 16px;border-radius:5px;cursor:pointer;transition:all 0.15s;border:none}\n.btn-primary{background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.25);color:var(--cyan)}.btn-primary:hover{background:rgba(0,212,255,0.18);transform:translateY(-1px)}.btn-primary:disabled{opacity:0.4;cursor:default;transform:none}\n.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text2);padding:7px 10px}.btn-ghost:hover{border-color:var(--border2);color:var(--text)}\n.btn-discord{background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.3);color:#7289da}.btn-discord:hover{background:rgba(88,101,242,0.2)}\n.progress-bar{padding:10px 24px;font-family:var(--mono);font-size:11px;color:var(--cyan);background:rgba(0,212,255,0.03);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}\n@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}.pdot{animation:blink 1s infinite;font-size:8px}\n.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:40px}.empty-icon{font-size:40px;opacity:0.15;margin-bottom:24px}.empty h2{font-family:var(--mono);font-size:18px;color:#fff;letter-spacing:1.5px;margin-bottom:8px}.empty p{font-size:13px;color:var(--text3);max-width:400px;line-height:1.6;margin-bottom:20px}\n.sp{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:24px}.schip{font-family:var(--mono);font-size:10px;padding:4px 10px;border:1px solid;border-radius:4px;display:flex;gap:6px}\n.btn-start{font-family:var(--mono);font-size:14px;font-weight:600;padding:14px 40px;border-radius:8px;cursor:pointer;background:linear-gradient(135deg,rgba(0,212,255,0.12),rgba(0,212,255,0.04));border:1px solid rgba(0,212,255,0.3);color:var(--cyan);letter-spacing:1px;transition:all 0.2s}.btn-start:hover{transform:scale(1.02);box-shadow:0 0 30px rgba(0,212,255,0.15)}\n.cost-note{margin-top:16px;font-size:10px;color:#333;font-family:var(--mono)}\n@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.skel{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px}\n.content{padding:16px 24px 40px;max-width:1200px;margin:0 auto}\n.sbar{display:flex;gap:4px;margin-bottom:16px;overflow-x:auto}.sitem{flex:1;min-width:90px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;text-align:center}.sdot{width:6px;height:6px;border-radius:50%;margin:0 auto 4px}.sname{font-size:9px;color:var(--text2);font-weight:500}.stime{font-family:var(--mono);font-size:9px;color:var(--text3)}.scount{font-family:var(--mono);font-size:10px;font-weight:600;margin-top:2px}\n.vcard{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px 24px;margin-bottom:16px;position:relative;overflow:hidden}.vcard::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.vcard.bull::before{background:linear-gradient(90deg,transparent,var(--green),transparent)}.vcard.bear::before{background:linear-gradient(90deg,transparent,var(--red),transparent)}.vcard.neutral::before{background:linear-gradient(90deg,transparent,var(--orange),transparent)}\n.vheader{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:10px}.vbias{font-family:var(--mono);font-size:20px;font-weight:700;letter-spacing:2px}.vconf{font-family:var(--mono);font-size:10px;padding:3px 10px;border-radius:4px;font-weight:600}.vsummary{font-size:13px;line-height:1.7;color:var(--text);margin-bottom:14px}.vlevels{font-family:var(--mono);font-size:11px;color:var(--cyan);background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.1);border-radius:6px;padding:10px 14px;margin-bottom:14px}\n.scenarios{display:grid;grid-template-columns:1fr 1fr;gap:10px}.scenario{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:8px;padding:12px}.schead{display:flex;justify-content:space-between;margin-bottom:6px}.sclabel{font-family:var(--mono);font-size:11px;font-weight:700}.scprob{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--cyan)}.sctrigger{font-size:10px;color:var(--text2);margin-bottom:3px}.sctarget{font-family:var(--mono);font-size:10px;color:var(--cyan);margin-bottom:3px}.scdesc{font-size:10px;color:var(--text3)}\n.infobox{background:var(--bg2);border:1px solid var(--border);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:12px}.infobox p{font-size:11px;line-height:1.5;color:var(--text2)}.infobox.cyan{border-left:2px solid var(--cyan)}.infobox.orange{border-left:2px solid var(--orange)}.infobox.pink{border-left:2px solid var(--pink)}\n.plabel{font-family:var(--mono);font-size:9px;font-weight:600;color:var(--text3);letter-spacing:1.5px;margin-bottom:6px}\n.stitle{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text3);letter-spacing:2px;margin-bottom:10px;display:flex;align-items:center;gap:8px}\n.qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:20px}\n.qcard{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px}.qtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.qname{font-family:var(--mono);font-size:10px;font-weight:600;color:#fff}.qpct{font-family:var(--mono);font-size:11px;font-weight:700}.qprice{font-family:var(--mono);font-size:18px;font-weight:700;color:#fff;margin-bottom:4px}.qrange{font-family:var(--mono);font-size:9px;color:var(--text3);margin-bottom:2px}.qchange{font-family:var(--mono);font-size:10px;font-weight:500}\n@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeUp 0.25s ease both}\n.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center}.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:28px;width:420px;max-width:90vw}.modal h3{font-family:var(--mono);font-size:13px;color:#fff;letter-spacing:1px;margin-bottom:20px}.modal label{font-size:11px;color:var(--text2);display:block;margin-bottom:6px}.modal-input{width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:11px;outline:none;margin-bottom:16px}\n.toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:20px}.toggle{width:36px;height:20px;border-radius:10px;cursor:pointer;background:var(--border);position:relative;transition:background 0.2s;border:none;flex-shrink:0}.toggle.on{background:rgba(0,212,255,0.4)}.toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform 0.2s}.toggle.on::after{transform:translateX(16px)}.toggle-label{font-size:11px;color:var(--text2)}.modal-actions{display:flex;justify-content:flex-end;gap:8px}\n.footer{padding:14px 24px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--text3)}\n.ebox{margin:8px 0;padding:10px 14px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.15);border-radius:6px;font-size:11px;color:var(--red)}\n.toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;font-family:var(--mono);font-size:11px;z-index:200;animation:fadeUp 0.3s ease}.toast.sending{background:rgba(88,101,242,0.2);border:1px solid rgba(88,101,242,0.3);color:#7289da}.toast.sent{background:rgba(0,230,118,0.15);border:1px solid rgba(0,230,118,0.25);color:var(--green)}.toast.error{background:rgba(255,82,82,0.12);border:1px solid rgba(255,82,82,0.2);color:var(--red)}\n@media(max-width:768px){.scenarios{grid-template-columns:1fr}.qgrid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}.content{padding:12px}.sbar{flex-wrap:wrap}}\n::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}\n";
