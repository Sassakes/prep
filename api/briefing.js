import { useState, useCallback, useEffect, useRef } from “react”;

/* ═══════════════════════════════════════════
CONFIGURATION
═══════════════════════════════════════════ */

const CATS = [
{ id: “nq_es”, label: “NQ / ES”, icon: “◆”, color: “#00e5ff” },
{ id: “rty”, label: “RTY”, icon: “◇”, color: “#ff6b35” },
{ id: “forex”, label: “Forex”, icon: “¤”, color: “#a78bfa” },
{ id: “commodities”, label: “Commodities”, icon: “●”, color: “#fbbf24” },
{ id: “bonds”, label: “Bonds”, icon: “▬”, color: “#34d399” },
{ id: “calendar”, label: “Calendrier”, icon: “◰”, color: “#f472b6” },
];

/* ═══════════════════════════════════════════
PROMPTS
═══════════════════════════════════════════ */

const PROMPT_PULSE = `Analyste macro senior pour scalper NQ. RÉPONDS UNIQUEMENT en JSON valide. Aucun texte hors JSON.

{
“market_pulse”: {
“sentiment”: “risk-on|risk-off|mixed”,
“sentiment_score”: 7,
“vix_context”: “VIX à X.X, IV en hausse/baisse, contango/backwardation”,
“flow_direction”: “Flux dominants détaillés: rotation sectors, equity/bonds/commodities flows”,
“key_theme”: “Narratif macro dominant 2-3 phrases”,
“session_recap”: “Session US veille: ES close XXXX (+/-X.X%, +/-XX pts), NQ XXXXX (+/-X.X%), RTY XXXX (+/-X.X%). Catalyst principal. Volume vs moyenne. Niveaux clés testés.”,
“intermarket”: “Corrélations clés: DXY vs NQ, 10Y yield direction, Oil impact, Gold signal”
},
“verdict”: {
“bias”: “BULLISH|BEARISH|NEUTRE”,
“confidence”: “HIGH|MEDIUM|LOW”,
“summary”: “3-5 phrases tradables. Niveaux, conditions, triggers concrets pour scalp NQ London/US Open.”,
“key_levels_nq”: “R2:XXXXX R1:XXXXX | Pivot:XXXXX | S1:XXXXX S2:XXXXX”,
“scenarios”: [
{“label”:“Scénario BULL”,“probability”:“XX%”,“trigger”:“condition précise”,“target”:“XXXXX-XXXXX”,“description”:“explication flux”},
{“label”:“Scénario BEAR”,“probability”:“XX%”,“trigger”:“condition précise”,“target”:“XXXXX-XXXXX”,“description”:“explication flux”}
]
},
“top_movers”: [
{“instrument”:“NQ”,“change_pct”:”+X.X%”,“context”:“raison”,“trend”:“up|down”}
]
}

IMPÉRATIF: Niveaux NQ RÉELS et ACTUELS. Session recap avec VRAIS chiffres de la veille. Top movers minimum: NQ, ES, RTY, DXY, WTI, Gold, 10Y, VIX, EUR/USD.`;

const PROMPT_NEWS = `Analyste macro pour scalper NQ. RÉPONDS UNIQUEMENT en JSON valide. Aucun texte hors JSON.

{
“news”: [
{
“id”: “1”,
“title”: “Titre court percutant”,
“summary”: “2-3 phrases: fait, impact marché, direction instrument”,
“category”: “nq_es|rty|forex|commodities|bonds|calendar”,
“impact”: “high|medium|low”,
“bias”: “bullish|bearish|neutral”,
“time”: “il y a Xh|aujourd’hui HH:MM”,
“source”: “Reuters|Bloomberg|CNBC|etc”,
“instruments”: [“NQ”,“ES”]
}
]
}

MINIMUM 8 news. Couvrir: tech/mega caps (NQ), small caps (RTY), forex (DXY,EUR,JPY), commodities (oil,gold), bonds (yields). Chaque news = impact concret sur les instruments. Priorise les news qui drivvent la VOLATILITÉ.`;

const PROMPT_CALENDAR = `Analyste macro pour scalper NQ. RÉPONDS UNIQUEMENT en JSON valide. Aucun texte hors JSON.

{
“upcoming_events”: [
{
“event”: “Nom complet”,
“date”: “JJ/MM HH:MM CET”,
“impact”: “high|medium|low”,
“affected”: [“NQ”,“ES”,“DXY”],
“consensus”: “X.X%|XXXk”,
“previous”: “X.X%|XXXk”,
“if_above”: “Bull/bear sur quoi + pourquoi en 1 phrase”,
“if_below”: “Bull/bear sur quoi + pourquoi en 1 phrase”
}
],
“session_times”: [
{“session”:“London Open”,“time”:“09:00 CET”,“note”:“Volatilité accrue, set du range”},
{“session”:“US Pre-market”,“time”:“14:30 CET”,“note”:“Données éco US”},
{“session”:“US Open”,“time”:“15:30 CET”,“note”:“Max volatilité, breakout/reversal”},
{“session”:“US Close”,“time”:“22:00 CET”,“note”:“MOC flows, squeeze potentiel”}
]
}

Cherche le calendrier économique de CETTE semaine. FILTRE: uniquement events IMPORTANTS (NFP, CPI, PPI, FOMC, PMI, retail sales, jobless claims, GDP, ISM, consumer confidence, housing, Fed speakers). Minimum 4 events avec consensus ET previous RÉELS.`;

/* ═══════════════════════════════════════════
API CALL — avec retry, validation, search toggle
═══════════════════════════════════════════ */

function wait(ms) {
return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function callAPI(systemPrompt, userMessage, useSearch, retries) {
if (useSearch === undefined) useSearch = true;
if (retries === undefined) retries = 1;
var attempt = 0;
while (attempt <= retries) {
try {
var body = {
model: “claude-haiku-4-5-20251001”,
max_tokens: 2000,
system: systemPrompt,
messages: [{ role: “user”, content: userMessage }],
};
if (useSearch) {
body.tools = [{ type: “web_search_20250305”, name: “web_search” }];
}
var response = await fetch(”/api/briefing”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify(body),
});
if (!response.ok) {
var errText = await response.text();
attempt++;
if (attempt <= retries) continue;
throw new Error(“HTTP “ + response.status + “: “ + errText.slice(0, 200));
}
var text = await response.text();
var result = null;
try {
result = JSON.parse(text);
} catch (parseErr) {
attempt++;
if (attempt <= retries) continue;
throw new Error(“Réponse serveur invalide”);
}
if (result.error) {
if (result.error.message && result.error.message.includes(“credit”)) {
throw new Error(result.error.message);
}
attempt++;
if (attempt <= retries) continue;
throw new Error(result.error.message || “Erreur API”);
}
var fullText = “”;
var blocks = result.content || [];
for (var i = 0; i < blocks.length; i++) {
if (blocks[i].type === “text” && blocks[i].text) {
fullText += blocks[i].text;
}
}
if (!fullText) {
attempt++;
if (attempt <= retries) continue;
throw new Error(“Réponse vide”);
}
var cleaned = fullText.replace(/`json|`/g, “”).trim();
var match = cleaned.match(/{[\s\S]*}/);
if (!match) {
attempt++;
if (attempt <= retries) continue;
throw new Error(“Pas de JSON dans la réponse”);
}
return JSON.parse(match[0]);
} catch (err) {
attempt++;
if (attempt <= retries) continue;
throw err;
}
}
}

/* ═══════════════════════════════════════════
DISCORD — embeds formatés
═══════════════════════════════════════════ */

function buildDiscordPayload(pulse, news, calendar) {
var v = pulse ? pulse.verdict : null;
var mp = pulse ? pulse.market_pulse : null;
var sentColor = 0xffa726;
if (v && v.bias === “BULLISH”) sentColor = 0x00e676;
if (v && v.bias === “BEARISH”) sentColor = 0xff5252;
var emoji = “🟡”;
if (v && v.bias === “BULLISH”) emoji = “🟢”;
if (v && v.bias === “BEARISH”) emoji = “🔴”;

var movers = “—”;
if (pulse && pulse.top_movers) {
movers = pulse.top_movers.slice(0, 10).map(function (m) {
return (m.trend === “up” ? “▲” : “▼”) + “ **” + m.instrument + “** “ + m.change_pct + “ — “ + m.context;
}).join(”\n”) || “—”;
}

var topNews = “—”;
if (news && news.news) {
var highNews = news.news.filter(function (n) { return n.impact === “high”; }).slice(0, 6);
if (highNews.length > 0) {
topNews = highNews.map(function (n) {
var icon = n.bias === “bullish” ? “🟢” : n.bias === “bearish” ? “🔴” : “⚪”;
return icon + “ **” + n.title + “**\n” + (n.summary || “”).slice(0, 120);
}).join(”\n\n”);
}
}

var events = “—”;
if (calendar && calendar.upcoming_events) {
var highEvents = calendar.upcoming_events.filter(function (e) { return e.impact === “high”; }).slice(0, 5);
if (highEvents.length > 0) {
events = highEvents.map(function (e) {
return “⏰ **” + e.event + “** — “ + e.date + “\n📊 Cons: “ + (e.consensus || “—”) + “ | Prev: “ + (e.previous || “—”) + “\n📈 “ + (e.if_above || “—”) + “\n📉 “ + (e.if_below || “—”);
}).join(”\n\n”);
}
}

var scenarios = “—”;
if (v && v.scenarios) {
scenarios = v.scenarios.map(function (s) {
return “**” + s.label + “** (” + s.probability + “)\n▸ Trigger: “ + s.trigger + “\n▸ Target: “ + s.target + “\n” + s.description;
}).join(”\n\n”);
}

var now = new Date();
var dateStr = now.toLocaleDateString(“fr-FR”, { weekday: “long”, day: “numeric”, month: “long”, year: “numeric” });

var embeds = [
{
title: emoji + “ VERDICT: “ + (v ? v.bias : “—”) + “ (Conf: “ + (v ? v.confidence : “—”) + “)”,
description: (v ? v.summary : “—”) || “—”,
color: sentColor,
fields: [
{ name: “🎯 Niveaux NQ”, value: (v ? v.key_levels_nq : “—”) || “—”, inline: false },
{ name: “📊 Sentiment”, value: ((mp ? mp.sentiment : “—”) || “—”).toUpperCase() + “ (” + (mp ? mp.sentiment_score : “—”) + “/10)”, inline: true },
{ name: “📈 VIX/Vol”, value: ((mp ? mp.vix_context : “—”) || “—”).slice(0, 100), inline: true },
],
footer: { text: “Flow Briefing” },
timestamp: now.toISOString(),
},
{ title: “📋 Session US Veille”, description: ((mp ? mp.session_recap : “—”) || “—”).slice(0, 1024), color: 0x1a1a2e },
{ title: “🎯 Scénarios”, description: scenarios.slice(0, 1024), color: sentColor },
{ title: “🔥 Top Movers”, description: movers.slice(0, 1024), color: 0x1a1a2e },
];

if (topNews !== “—”) {
embeds.push({ title: “⚠️ News High Impact”, description: topNews.slice(0, 1024), color: 0xff4444 });
}
if (events !== “—”) {
embeds.push({ title: “📅 Calendrier Éco”, description: events.slice(0, 1024), color: 0xf472b6 });
}

return {
content: “# ⚡ FLOW BRIEFING — “ + dateStr.toUpperCase(),
embeds: embeds,
};
}

async function sendToDiscord(url, pulse, news, calendar) {
var payload = buildDiscordPayload(pulse, news, calendar);
var res = await fetch(url, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify(payload),
});
if (!res.ok) {
var err = await res.text();
throw new Error(“Discord “ + res.status + “: “ + err.slice(0, 100));
}
}

/* ═══════════════════════════════════════════
SESSION COUNTDOWN
═══════════════════════════════════════════ */

function getSessionCountdowns() {
var now = new Date();
var sessions = [
{ name: “London Open”, h: 9, m: 0 },
{ name: “EU Close Overlap”, h: 14, m: 0 },
{ name: “US Pre-Market Data”, h: 14, m: 30 },
{ name: “US Open”, h: 15, m: 30 },
{ name: “US Power Hour”, h: 21, m: 0 },
{ name: “US Close”, h: 22, m: 0 },
];

var cet = new Date(now.toLocaleString(“en-US”, { timeZone: “Europe/Paris” }));
var cetH = cet.getHours();
var cetM = cet.getMinutes();
var cetTotal = cetH * 60 + cetM;

return sessions.map(function (s) {
var sTotal = s.h * 60 + s.m;
var diff = sTotal - cetTotal;
var status = “upcoming”;
var label = “”;

```
if (diff < -30) {
status = "passed";
label = "Terminé";
} else if (diff < 0) {
status = "active";
label = "EN COURS";
} else if (diff < 60) {
status = "soon";
var hh = Math.floor(diff / 60);
var mm = diff % 60;
label = hh > 0 ? hh + "h" + String(mm).padStart(2, "0") : mm + "min";
} else {
var hh2 = Math.floor(diff / 60);
var mm2 = diff % 60;
label = hh2 + "h" + String(mm2).padStart(2, "0");
}

return {
name: s.name,
h: s.h,
m: s.m,
status: status,
label: label,
time: String(s.h).padStart(2, "0") + ":" + String(s.m).padStart(2, "0") + " CET",
};
```

});
}

/* ═══════════════════════════════════════════
MAIN COMPONENT
═══════════════════════════════════════════ */

export default function App() {
const [pulse, setPulse] = useState(null);
const [news, setNews] = useState(null);
const [calendar, setCalendar] = useState(null);
const [loading, setLoading] = useState({ pulse: false, news: false, calendar: false });
const [errors, setErrors] = useState({ pulse: null, news: null, calendar: null });
const [activeFilter, setActiveFilter] = useState(“all”);
const [expandedNews, setExpandedNews] = useState(new Set());
const [searchQuery, setSearchQuery] = useState(””);
const [showSettings, setShowSettings] = useState(false);
const [webhook, setWebhook] = useState(””);
const [tempWebhook, setTempWebhook] = useState(””);
const [autoDiscord, setAutoDiscord] = useState(false);
const [tempAutoDiscord, setTempAutoDiscord] = useState(false);
const [discordStatus, setDiscordStatus] = useState(null);
const [lastRefresh, setLastRefresh] = useState(null);
const [step, setStep] = useState(””);
const [sessions, setSessions] = useState([]);

useEffect(function () {
try {
setWebhook(localStorage.getItem(“flow_webhook”) || “”);
setAutoDiscord(localStorage.getItem(“flow_auto_discord”) === “true”);
} catch (e) { /* ignore */ }
setSessions(getSessionCountdowns());
var timer = setInterval(function () { setSessions(getSessionCountdowns()); }, 60000);
return function () { clearInterval(timer); };
}, []);

var openSettings = function () {
setTempWebhook(webhook);
setTempAutoDiscord(autoDiscord);
setShowSettings(true);
};

var saveSettings = function () {
setWebhook(tempWebhook);
setAutoDiscord(tempAutoDiscord);
try {
localStorage.setItem(“flow_webhook”, tempWebhook);
localStorage.setItem(“flow_auto_discord”, tempAutoDiscord.toString());
} catch (e) { /* ignore */ }
setShowSettings(false);
};

var handleSendDiscord = async function (p, n, c) {
var hook = webhook || “”;
try { hook = localStorage.getItem(“flow_webhook”) || hook; } catch (e) { /* ignore */ }
if (!hook) return;
setDiscordStatus(“sending”);
try {
await sendToDiscord(hook, p || pulse, n || news, c || calendar);
setDiscordStatus(“sent”);
setTimeout(function () { setDiscordStatus(null); }, 3000);
} catch (err) {
console.error(“Discord:”, err);
setDiscordStatus(“error”);
setTimeout(function () { setDiscordStatus(null); }, 4000);
}
};

var fetchBriefing = useCallback(async function () {
var now = new Date();
var dateStr = now.toLocaleDateString(“fr-FR”, { weekday: “long”, year: “numeric”, month: “long”, day: “numeric” });
var timeStr = now.toLocaleTimeString(“fr-FR”, { hour: “2-digit”, minute: “2-digit” });
var ctx = “Date: “ + dateStr + “, “ + timeStr + “ CET. Pour scalper NQ, volatilité London/US Open.”;

```
setPulse(null);
setNews(null);
setCalendar(null);
setErrors({ pulse: null, news: null, calendar: null });

var p = null;
var n = null;
var c = null;

// ── CALL 1: Pulse + Verdict (PAS de web search = rapide ~3s) ──
setLoading(function (prev) { return { pulse: true, news: prev.news, calendar: prev.calendar }; });
setStep("① Analyse macro, verdict & movers...");
try {
p = await callAPI(PROMPT_PULSE, ctx + " Donne le verdict actionable avec niveaux NQ actuels, recap session US veille, VIX context, top movers.", false);
setPulse(p);
} catch (e) {
setErrors(function (prev) { return { pulse: e.message, news: prev.news, calendar: prev.calendar }; });
}
setLoading(function (prev) { return { pulse: false, news: prev.news, calendar: prev.calendar }; });

// ── Pause 6s pour éviter rate limit ──
setStep("⏳ Pause anti rate-limit...");
await wait(6000);

// ── CALL 2: News (avec web search) ──
setLoading(function (prev) { return { pulse: prev.pulse, news: true, calendar: prev.calendar }; });
setStep("② Scan des news & catalysts...");
try {
n = await callAPI(PROMPT_NEWS, ctx + " Cherche dernières news macro/financières impactant NQ, ES, RTY, Forex, Commodities, Bonds. Focus volatilité.", true);
setNews(n);
} catch (e) {
setErrors(function (prev) { return { pulse: prev.pulse, news: e.message, calendar: prev.calendar }; });
}
setLoading(function (prev) { return { pulse: prev.pulse, news: false, calendar: prev.calendar }; });

// ── Pause 6s pour éviter rate limit ──
setStep("⏳ Pause anti rate-limit...");
await wait(6000);

// ── CALL 3: Calendar (avec web search) ──
setLoading(function (prev) { return { pulse: prev.pulse, news: prev.news, calendar: true }; });
setStep("③ Calendrier économique...");
try {
c = await callAPI(PROMPT_CALENDAR, ctx + " Cherche calendrier économique de cette semaine. Events importants avec consensus, previous, scénarios if above/below.", true);
setCalendar(c);
} catch (e) {
setErrors(function (prev) { return { pulse: prev.pulse, news: prev.news, calendar: e.message }; });
}
setLoading(function (prev) { return { pulse: prev.pulse, news: prev.news, calendar: false }; });

setStep("");
setLastRefresh(new Date());
setSessions(getSessionCountdowns());

// Auto Discord
try {
var hook = localStorage.getItem("flow_webhook") || "";
var auto = localStorage.getItem("flow_auto_discord") === "true";
if (hook && auto && (p || n || c)) {
setTimeout(function () { handleSendDiscord(p, n, c); }, 800);
}
} catch (e) { /* ignore */ }
```

}, []);

var isLoading = loading.pulse || loading.news || loading.calendar;
var hasData = pulse || news || calendar;

var filteredNews = null;
if (news && news.news) {
filteredNews = news.news.filter(function (n) {
var matchCat = activeFilter === “all” || n.category === activeFilter;
var q = searchQuery.toLowerCase();
var matchSearch = !searchQuery ||
(n.title && n.title.toLowerCase().includes(q)) ||
(n.summary && n.summary.toLowerCase().includes(q)) ||
(n.instruments && n.instruments.some(function (inst) { return inst.toLowerCase().includes(q); }));
return matchCat && matchSearch;
});
}

var toggleExpand = function (id) {
setExpandedNews(function (prev) {
var next = new Set(prev);
if (next.has(id)) { next.delete(id); } else { next.add(id); }
return next;
});
};

var gc = function (c) { var f = CATS.find(function (x) { return x.id === c; }); return f ? f.color : “#555”; };
var gi = function (c) { var f = CATS.find(function (x) { return x.id === c; }); return f ? f.icon : “•”; };
var ic = function (i) { return i === “high” ? “#ff4444” : i === “medium” ? “#ffa726” : “#555”; };
var bc = function (b) { return b === “bullish” ? “#00e676” : b === “bearish” ? “#ff5252” : “#78909c”; };
var bl = function (b) { return b === “bullish” ? “▲ BULL” : b === “bearish” ? “▼ BEAR” : “— NEUTRE”; };
var sc = function (s) { return s === “active” ? “#00e676” : s === “soon” ? “#ffa726” : s === “passed” ? “#333” : “#555”; };

return (
<div className="root">
<style>{CSS_STYLES}</style>

```
<header className="header">
<div className="logo-area">
<div className="logo-mark">⚡</div>
<div>
<div className="logo-text">FLOW BRIEFING</div>
<div className="logo-sub">Macro · Volatility · Flux</div>
</div>
</div>
<div className="header-actions">
{lastRefresh && <span className="time-badge">MàJ {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
{hasData && webhook && (
<button className="btn btn-discord" onClick={function () { handleSendDiscord(); }}>
{discordStatus === "sending" ? "◌ Envoi..." : "📨 Discord"}
</button>
)}
<button className="btn btn-ghost" onClick={openSettings}>⚙</button>
<button className="btn btn-primary" onClick={fetchBriefing} disabled={isLoading}>
{isLoading ? "◌ Scan..." : "↻ Scanner"}
</button>
</div>
</header>

{step && <div className="progress-bar"><span className="progress-dot">●</span> {step}</div>}

{showSettings && (
<div className="modal-overlay" onClick={function () { setShowSettings(false); }}>
<div className="modal" onClick={function (e) { e.stopPropagation(); }}>
<h3>⚙ PARAMÈTRES</h3>
<label>Webhook Discord</label>
<input className="modal-input" type="text" placeholder="https://discord.com/api/webhooks/..." value={tempWebhook} onChange={function (e) { setTempWebhook(e.target.value); }} />
<div className="toggle-row">
<button className={"toggle" + (tempAutoDiscord ? " on" : "")} onClick={function () { setTempAutoDiscord(!tempAutoDiscord); }} />
<span style={{ fontSize: 11, color: "var(--text2)" }}>Envoyer auto sur Discord après chaque scan</span>
</div>
<div className="modal-actions">
<button className="btn btn-ghost" onClick={function () { setShowSettings(false); }}>Annuler</button>
<button className="btn btn-primary" onClick={saveSettings}>Sauvegarder</button>
</div>
</div>
</div>
)}

{discordStatus && (
<div className={"discord-toast " + discordStatus}>
{discordStatus === "sending" && "📨 Envoi vers Discord..."}
{discordStatus === "sent" && "✓ Briefing envoyé sur Discord"}
{discordStatus === "error" && "✗ Erreur — vérifie le webhook"}
</div>
)}

{!hasData && !isLoading && (
<div className="empty">
<div className="empty-icon">⚡</div>
<h2>FLOW BRIEFING</h2>
<p>Scan en 3 étapes : Macro & Verdict → News → Calendrier Éco.<br />Résultats progressifs avec pauses anti rate-limit.</p>
{sessions.length > 0 && (
<div className="sessions-preview">
{sessions.filter(function (s) { return s.status !== "passed"; }).slice(0, 4).map(function (s, i) {
return <div key={i} className="session-chip" style={{ borderColor: sc(s.status), color: sc(s.status) }}>{s.name} <span style={{ fontWeight: 700 }}>{s.label}</span></div>;
})}
</div>
)}
<button className="btn-start" onClick={fetchBriefing}>Scanner les marchés</button>
<div style={{ marginTop: 16, fontSize: 10, color: "#333", fontFamily: "var(--mono)" }}>Coût estimé: ~$0.02 par scan (Haiku 4.5)</div>
</div>
)}

{(hasData || isLoading) && (
<div className="content">

{sessions.length > 0 && (
<div className="session-bar">
{sessions.map(function (s, i) {
return (
<div key={i} className="session-item" style={{ opacity: s.status === "passed" ? 0.3 : 1 }}>
<div className="session-dot" style={{ background: sc(s.status) }} />
<div className="session-name">{s.name}</div>
<div className="session-time">{s.time}</div>
<div className="session-countdown" style={{ color: sc(s.status) }}>{s.label}</div>
</div>
);
})}
</div>
)}

{loading.pulse && !pulse && (
<div style={{ marginBottom: 20 }}>
<div className="skel" style={{ height: 140, marginBottom: 12 }} />
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
<div className="skel" style={{ height: 80 }} />
<div className="skel" style={{ height: 80 }} />
<div className="skel" style={{ height: 80 }} />
</div>
</div>
)}
{errors.pulse && <div className="error-box"><span>⚠ Macro: {errors.pulse}</span><button className="btn btn-ghost retry-btn" onClick={fetchBriefing}>Retry</button></div>}

{pulse && pulse.verdict && (
<div className={"verdict-card fade-up " + (pulse.verdict.bias === "BULLISH" ? "bull" : pulse.verdict.bias === "BEARISH" ? "bear" : "neutral")}>
<div className="verdict-header">
<div className="verdict-bias" style={{
color: pulse.verdict.bias === "BULLISH" ? "var(--green)" : pulse.verdict.bias === "BEARISH" ? "var(--red)" : "var(--orange)"
}}>
{pulse.verdict.bias === "BULLISH" ? "▲ " : pulse.verdict.bias === "BEARISH" ? "▼ " : "— "}
{pulse.verdict.bias || "—"}
</div>
<div className="verdict-conf" style={{
background: pulse.verdict.confidence === "HIGH" ? "rgba(0,230,118,0.1)" : pulse.verdict.confidence === "MEDIUM" ? "rgba(255,167,38,0.1)" : "rgba(255,82,82,0.1)",
color: pulse.verdict.confidence === "HIGH" ? "var(--green)" : pulse.verdict.confidence === "MEDIUM" ? "var(--orange)" : "var(--red)",
border: "1px solid " + (pulse.verdict.confidence === "HIGH" ? "rgba(0,230,118,0.2)" : pulse.verdict.confidence === "MEDIUM" ? "rgba(255,167,38,0.2)" : "rgba(255,82,82,0.2)"),
}}>CONF: {pulse.verdict.confidence || "—"}</div>
</div>
<p className="verdict-summary">{pulse.verdict.summary}</p>
{pulse.verdict.key_levels_nq && <div className="verdict-levels">🎯 {pulse.verdict.key_levels_nq}</div>}
{pulse.verdict.scenarios && pulse.verdict.scenarios.length > 0 && (
<div className="scenarios">
{pulse.verdict.scenarios.map(function (s, i) {
return (
<div key={i} className="scenario">
<div className="scenario-head">
<span className="scenario-label" style={{ color: s.label && s.label.includes("BULL") ? "var(--green)" : "var(--red)" }}>{s.label}</span>
<span className="scenario-prob" style={{ color: "var(--cyan)" }}>{s.probability}</span>
</div>
<div className="scenario-trigger">▸ Trigger: {s.trigger}</div>
<div className="scenario-target">▸ Target: {s.target}</div>
<div className="scenario-desc">{s.description}</div>
</div>
);
})}
</div>
)}
</div>
)}

{pulse && pulse.market_pulse && pulse.market_pulse.session_recap && (
<div className="session-recap fade-up">
<div className="pulse-label">📋 SESSION US — RECAP</div>
<p>{pulse.market_pulse.session_recap}</p>
</div>
)}

{pulse && pulse.market_pulse && (
<div className="pulse-grid">
<div className="pulse-card fade-up">
<div className="pulse-label">SENTIMENT</div>
<div className="pulse-val" style={{
color: pulse.market_pulse.sentiment === "risk-on" ? "var(--green)" : pulse.market_pulse.sentiment === "risk-off" ? "var(--red)" : "var(--orange)"
}}>
{(pulse.market_pulse.sentiment || "—").toUpperCase()}
<span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>{pulse.market_pulse.sentiment_score}/10</span>
</div>
</div>
<div className="pulse-card fade-up"><div className="pulse-label">VIX / VOL</div><div className="pulse-text">{pulse.market_pulse.vix_context || "—"}</div></div>
<div className="pulse-card fade-up"><div className="pulse-label">FLUX DOMINANTS</div><div className="pulse-text">{pulse.market_pulse.flow_direction || "—"}</div></div>
</div>
)}

{pulse && pulse.market_pulse && pulse.market_pulse.intermarket && (
<div className="intermarket fade-up">
<div className="pulse-label">🔗 CORRÉLATIONS INTERMARCHÉ</div>
<p>{pulse.market_pulse.intermarket}</p>
</div>
)}

{pulse && pulse.market_pulse && pulse.market_pulse.key_theme && (
<div className="theme-box fade-up">
<span className="pulse-label">THÈME DU JOUR</span>
<p style={{ marginTop: 6 }}>{pulse.market_pulse.key_theme}</p>
</div>
)}

{pulse && pulse.top_movers && pulse.top_movers.length > 0 && (
<div>
<div className="section-title"><span style={{ color: "var(--orange)" }}>●</span> TOP MOVERS</div>
<div className="movers-grid">
{pulse.top_movers.map(function (m, i) {
return (
<div key={i} className="mover fade-up" style={{ animationDelay: i * 30 + "ms" }}>
<div className="mover-top">
<span className="mover-name">{m.instrument}</span>
<span className="mover-pct" style={{ color: m.trend === "up" ? "var(--green)" : "var(--red)" }}>{m.change_pct}</span>
</div>
<div className="mover-ctx">{m.context}</div>
</div>
);
})}
</div>
</div>
)}

{loading.news && !news && (
<div>
<div className="skel" style={{ height: 44, marginBottom: 4 }} />
<div className="skel" style={{ height: 44, marginBottom: 4 }} />
<div className="skel" style={{ height: 44, marginBottom: 4 }} />
<div className="skel" style={{ height: 44, marginBottom: 4 }} />
<div className="skel" style={{ height: 44, marginBottom: 4 }} />
</div>
)}
{errors.news && <div className="error-box"><span>⚠ News: {errors.news}</span></div>}

{filteredNews && filteredNews.length >= 0 && news && news.news && news.news.length > 0 && (
<div>
<div className="filters">
<div className="filter-row">
<button className={"fbtn" + (activeFilter === "all" ? " active" : "")} onClick={function () { setActiveFilter("all"); }}>ALL</button>
{CATS.map(function (cat) {
var isActive = activeFilter === cat.id;
return <button key={cat.id} className={"fbtn" + (isActive ? " active" : "")} onClick={function () { setActiveFilter(cat.id); }} style={isActive ? { borderColor: cat.color, color: cat.color, background: cat.color + "0a" } : {}}>{cat.icon} {cat.label}</button>;
})}
</div>
<input className="search-input" placeholder="Rechercher..." value={searchQuery} onChange={function (e) { setSearchQuery(e.target.value); }} />
</div>
<div className="news-list">
{filteredNews.length === 0 && <div className="empty-filter">Aucune news pour ce filtre</div>}
{filteredNews.map(function (n, i) {
var nid = n.id || i;
return (
<div key={nid} className="news-item fade-up" onClick={function () { toggleExpand(nid); }} style={{ borderLeftColor: gc(n.category), animationDelay: i * 25 + "ms" }}>
<div className="news-head">
<div className="news-left">
<span style={{ color: gc(n.category), fontSize: 10 }}>{gi(n.category)}</span>
<span className="impact-tag" style={{ background: ic(n.impact) + "15", color: ic(n.impact), border: "1px solid " + ic(n.impact) + "30" }}>{(n.impact || "").toUpperCase()}</span>
<span className="news-title">{n.title}</span>
</div>
<div className="news-right">
<span className="bias-tag" style={{ color: bc(n.bias) }}>{bl(n.bias)}</span>
<span className="news-time">{n.time}</span>
</div>
</div>
{expandedNews.has(nid) && (
<div className="news-body">
<p className="news-summary">{n.summary}</p>
<div className="news-tags">
{n.instruments && n.instruments.map(function (t) { return <span key={t} className="inst-tag">{t}</span>; })}
{n.source && <span className="news-src">{n.source}</span>}
</div>
</div>
)}
</div>
);
})}
</div>
</div>
)}

{loading.calendar && !calendar && (
<div>
<div className="skel" style={{ height: 90, marginBottom: 8 }} />
<div className="skel" style={{ height: 90, marginBottom: 8 }} />
<div className="skel" style={{ height: 90, marginBottom: 8 }} />
</div>
)}
{errors.calendar && <div className="error-box"><span>⚠ Calendrier: {errors.calendar}</span></div>}

{calendar && calendar.upcoming_events && calendar.upcoming_events.length > 0 && (
<div>
<div className="section-title" style={{ marginTop: 12 }}><span style={{ color: "var(--pink)" }}>◰</span> CALENDRIER ÉCO</div>
<div className="events-grid">
{calendar.upcoming_events.map(function (e, i) {
return (
<div key={i} className="event-card fade-up" style={{ animationDelay: i * 30 + "ms" }}>
<div className="event-top">
<span className="impact-tag" style={{ background: ic(e.impact) + "15", color: ic(e.impact), border: "1px solid " + ic(e.impact) + "30" }}>{(e.impact || "").toUpperCase()}</span>
<span className="event-date">{e.date}</span>
</div>
<div className="event-name">{e.event}</div>
{(e.consensus || e.previous) && (
<div style={{ marginBottom: 6 }}>
{e.consensus && <div className="event-row">Consensus: <span>{e.consensus}</span></div>}
{e.previous && <div className="event-row">Précédent: <span>{e.previous}</span></div>}
</div>
)}
{e.if_above && <div className="event-scenario event-bull">📈 {e.if_above}</div>}
{e.if_below && <div className="event-scenario event-bear">📉 {e.if_below}</div>}
<div className="event-affected">{e.affected && e.affected.map(function (a) { return <span key={a} className="inst-tag">{a}</span>; })}</div>
</div>
);
})}
</div>
</div>
)}
</div>
)}

<footer className="footer">
<span>FLOW BRIEFING · NQ SCALPER</span>
<span>3 calls · Haiku 4.5 · ~$0.02/scan</span>
</footer>
</div>
```

);
}

/* ═══════════════════════════════════════════
STYLES
═══════════════════════════════════════════ */

const CSS_STYLES = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap'); :root{--bg:#07080c;--bg2:#0c0e14;--bg3:#12151e;--border:#1a1e2e;--border2:#252a3a;--text:#c4c8d4;--text2:#6b7084;--text3:#3d4156;--cyan:#00d4ff;--green:#00e676;--red:#ff5252;--orange:#ffa726;--pink:#f472b6;--mono:'IBM Plex Mono',monospace;--sans:'DM Sans',sans-serif} *{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg)} .root{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh} .header{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid var(--border);background:rgba(7,8,12,0.95);backdrop-filter:blur(12px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px} .logo-area{display:flex;align-items:center;gap:12px}.logo-mark{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,212,255,0.05));border:1px solid rgba(0,212,255,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--cyan)}.logo-text{font-family:var(--mono);font-size:13px;font-weight:600;color:#fff;letter-spacing:2px}.logo-sub{font-size:10px;color:var(--text3);margin-top:1px} .header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.time-badge{font-family:var(--mono);font-size:10px;color:var(--text3)} .btn{font-family:var(--mono);font-size:11px;font-weight:500;padding:7px 16px;border-radius:5px;cursor:pointer;transition:all 0.15s;border:none} .btn-primary{background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.25);color:var(--cyan)}.btn-primary:hover{background:rgba(0,212,255,0.18);transform:translateY(-1px)}.btn-primary:disabled{opacity:0.4;cursor:default;transform:none} .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text2);padding:7px 10px}.btn-ghost:hover{border-color:var(--border2);color:var(--text)} .btn-discord{background:rgba(88,101,242,0.12);border:1px solid rgba(88,101,242,0.3);color:#7289da}.btn-discord:hover{background:rgba(88,101,242,0.2)} .progress-bar{padding:10px 24px;font-family:var(--mono);font-size:11px;color:var(--cyan);background:rgba(0,212,255,0.03);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px} @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}.progress-dot{animation:blink 1s infinite;font-size:8px} .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:40px}.empty-icon{font-size:40px;opacity:0.15;margin-bottom:24px}.empty h2{font-family:var(--mono);font-size:18px;color:#fff;letter-spacing:1.5px;margin-bottom:8px}.empty p{font-size:13px;color:var(--text3);max-width:400px;line-height:1.6;margin-bottom:20px} .sessions-preview{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:24px}.session-chip{font-family:var(--mono);font-size:10px;padding:4px 10px;border:1px solid;border-radius:4px;display:flex;gap:6px} .btn-start{font-family:var(--mono);font-size:14px;font-weight:600;padding:14px 40px;border-radius:8px;cursor:pointer;background:linear-gradient(135deg,rgba(0,212,255,0.12),rgba(0,212,255,0.04));border:1px solid rgba(0,212,255,0.3);color:var(--cyan);letter-spacing:1px;transition:all 0.2s}.btn-start:hover{transform:scale(1.02);box-shadow:0 0 30px rgba(0,212,255,0.15)} @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.skel{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px} .content{padding:16px 24px 40px;max-width:1200px;margin:0 auto} .session-bar{display:flex;gap:4px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px}.session-item{flex:1;min-width:100px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;text-align:center}.session-dot{width:6px;height:6px;border-radius:50%;margin:0 auto 4px}.session-name{font-size:9px;color:var(--text2);font-weight:500;margin-bottom:2px}.session-time{font-family:var(--mono);font-size:9px;color:var(--text3)}.session-countdown{font-family:var(--mono);font-size:10px;font-weight:600;margin-top:2px} .verdict-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px 24px;margin-bottom:16px;position:relative;overflow:hidden}.verdict-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}.verdict-card.bull::before{background:linear-gradient(90deg,transparent,var(--green),transparent)}.verdict-card.bear::before{background:linear-gradient(90deg,transparent,var(--red),transparent)}.verdict-card.neutral::before{background:linear-gradient(90deg,transparent,var(--orange),transparent)} .verdict-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:10px}.verdict-bias{font-family:var(--mono);font-size:20px;font-weight:700;letter-spacing:2px}.verdict-conf{font-family:var(--mono);font-size:10px;padding:3px 10px;border-radius:4px;font-weight:600}.verdict-summary{font-size:13px;line-height:1.7;color:var(--text);margin-bottom:14px}.verdict-levels{font-family:var(--mono);font-size:11px;color:var(--cyan);background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.1);border-radius:6px;padding:10px 14px;margin-bottom:14px} .scenarios{display:grid;grid-template-columns:1fr 1fr;gap:10px}.scenario{background:rgba(255,255,255,0.015);border:1px solid var(--border);border-radius:8px;padding:12px}.scenario-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.scenario-label{font-family:var(--mono);font-size:11px;font-weight:700}.scenario-prob{font-family:var(--mono);font-size:11px;font-weight:600}.scenario-trigger{font-size:10px;color:var(--text2);margin-bottom:3px}.scenario-target{font-family:var(--mono);font-size:10px;color:var(--cyan);margin-bottom:3px}.scenario-desc{font-size:10px;color:var(--text3)} .session-recap{background:var(--bg2);border:1px solid var(--border);border-left:2px solid var(--cyan);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:16px}.session-recap p{font-size:12px;line-height:1.6;color:var(--text)} .pulse-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}.pulse-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px}.pulse-label{font-family:var(--mono);font-size:9px;font-weight:600;color:var(--text3);letter-spacing:1.5px;margin-bottom:6px}.pulse-val{font-family:var(--mono);font-size:16px;font-weight:700}.pulse-text{font-size:11px;line-height:1.5;color:var(--text2)} .intermarket{background:var(--bg2);border:1px solid var(--border);border-left:2px solid var(--orange);border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:16px}.intermarket p{font-size:11px;line-height:1.5;color:var(--text2)} .theme-box{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;line-height:1.6} .section-title{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text3);letter-spacing:2px;margin-bottom:10px;display:flex;align-items:center;gap:8px} .movers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-bottom:20px}.mover{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;transition:all 0.15s}.mover:hover{transform:translateY(-1px);border-color:var(--border2)}.mover-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}.mover-name{font-family:var(--mono);font-size:11px;font-weight:600;color:#fff}.mover-pct{font-family:var(--mono);font-size:12px;font-weight:700}.mover-ctx{font-size:10px;color:var(--text3);line-height:1.3} .filters{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}.filter-row{display:flex;gap:4px;flex-wrap:wrap}.fbtn{font-family:var(--mono);font-size:10px;padding:5px 10px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text3);transition:all 0.12s}.fbtn:hover{border-color:var(--border2);color:var(--text2)}.fbtn.active{border-color:var(--cyan);color:var(--cyan);background:rgba(0,212,255,0.06)} .search-input{font-family:var(--mono);font-size:11px;padding:6px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;color:var(--text);outline:none;width:200px} .news-list{display:flex;flex-direction:column;gap:3px;margin-bottom:24px}.news-item{padding:10px 14px;background:var(--bg2);border-left:2px solid var(--border);border-radius:0 6px 6px 0;cursor:pointer;transition:all 0.12s}.news-item:hover{background:var(--bg3);transform:translateX(2px)}.news-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.news-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0}.news-right{display:flex;align-items:center;gap:10px;flex-shrink:0}.impact-tag{font-family:var(--mono);font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px;flex-shrink:0}.news-title{font-size:12px;font-weight:500;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bias-tag{font-family:var(--mono);font-size:9px;font-weight:700}.news-time{font-family:var(--mono);font-size:9px;color:var(--text3);white-space:nowrap} .news-body{margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}.news-summary{font-size:11px;line-height:1.6;color:var(--text2);margin-bottom:8px}.news-tags{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.inst-tag{font-family:var(--mono);font-size:9px;padding:2px 7px;border-radius:3px;background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.1);color:var(--cyan)}.news-src{font-size:9px;color:var(--text3);font-style:italic;margin-left:auto}.empty-filter{padding:24px;text-align:center;color:var(--text3);font-size:12px} .events-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;margin-bottom:20px}.event-card{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px}.event-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.event-date{font-family:var(--mono);font-size:10px;color:var(--text3)}.event-name{font-size:13px;font-weight:600;color:#ddd;margin-bottom:6px}.event-row{font-size:10px;color:var(--text2);margin-bottom:3px;font-family:var(--mono)}.event-row span{color:var(--text)}.event-scenario{font-size:10px;line-height:1.4;margin-bottom:3px;padding:4px 8px;border-radius:4px}.event-bull{background:rgba(0,230,118,0.06);color:var(--green)}.event-bear{background:rgba(255,82,82,0.06);color:var(--red)}.event-affected{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fade-up{animation:fadeUp 0.25s ease both} .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center}.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:12px;padding:28px;width:420px;max-width:90vw}.modal h3{font-family:var(--mono);font-size:13px;color:#fff;letter-spacing:1px;margin-bottom:20px}.modal label{font-size:11px;color:var(--text2);display:block;margin-bottom:6px}.modal-input{width:100%;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:11px;outline:none;margin-bottom:16px} .toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:20px}.toggle{width:36px;height:20px;border-radius:10px;cursor:pointer;background:var(--border);position:relative;transition:background 0.2s;border:none;flex-shrink:0}.toggle.on{background:rgba(0,212,255,0.4)}.toggle::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform 0.2s}.toggle.on::after{transform:translateX(16px)}.modal-actions{display:flex;justify-content:flex-end;gap:8px} .footer{padding:14px 24px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--text3);letter-spacing:0.5px} .error-box{margin:8px 0;padding:10px 14px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.15);border-radius:6px;font-size:11px;color:var(--red);display:flex;justify-content:space-between;align-items:center}.retry-btn{font-size:10px;padding:4px 10px;color:var(--red);border-color:rgba(255,82,82,0.3)} .discord-toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;font-family:var(--mono);font-size:11px;z-index:200;animation:fadeUp 0.3s ease}.discord-toast.sending{background:rgba(88,101,242,0.2);border:1px solid rgba(88,101,242,0.3);color:#7289da}.discord-toast.sent{background:rgba(0,230,118,0.15);border:1px solid rgba(0,230,118,0.25);color:var(--green)}.discord-toast.error{background:rgba(255,82,82,0.12);border:1px solid rgba(255,82,82,0.2);color:var(--red)} @media(max-width:768px){.pulse-grid{grid-template-columns:1fr}.scenarios{grid-template-columns:1fr}.events-grid{grid-template-columns:1fr}.content{padding:12px}.search-input{width:140px}.session-bar{flex-wrap:wrap}} ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}`;
