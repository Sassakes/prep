import { useState, useCallback, useEffect } from "react";

const CATS = [
  { id: "nq_es", label: "NQ / ES", icon: "◆", color: "#00e5ff" },
  { id: "rty", label: "RTY", icon: "◇", color: "#ff6b35" },
  { id: "forex", label: "Forex", icon: "¤", color: "#a78bfa" },
  { id: "commodities", label: "Commodities", icon: "●", color: "#fbbf24" },
  { id: "bonds", label: "Bonds", icon: "▬", color: "#34d399" },
  { id: "calendar", label: "Calendrier", icon: "◰", color: "#f472b6" },
];

const PROMPT_PULSE = `Tu es un analyste macro/flux senior pour un scalper NQ.
RÉPONDS UNIQUEMENT EN JSON VALIDE. Pas de markdown, pas de backticks.

{
  "market_pulse": {
    "sentiment": "risk-on | risk-off | mixed",
    "sentiment_score": 7,
    "vix_context": "VIX à X, vol implicite, term structure",
    "flow_direction": "Flux dominants détaillés",
    "key_theme": "Narratif macro dominant 2-3 phrases",
    "session_recap": "Recap session US veille: ES +/-X% (pts), NQ +/-X% (pts), RTY +/-X%. Catalysts, volume, niveaux testés."
  },
  "verdict": {
    "bias": "BULLISH | BEARISH | NEUTRE",
    "confidence": "HIGH | MEDIUM | LOW",
    "summary": "3-5 phrases conclusion tradable avec niveaux, conditions, triggers pour scalp NQ",
    "key_levels_nq": "Résistances: XXXX, XXXX / Supports: XXXX, XXXX / Pivot: XXXX",
    "scenarios": [
      { "label": "Scénario BULL", "probability": "60%", "trigger": "condition", "target": "XXXXX-XXXXX", "description": "explication" },
      { "label": "Scénario BEAR", "probability": "40%", "trigger": "condition", "target": "XXXXX-XXXXX", "description": "explication" }
    ]
  },
  "top_movers": [
    { "instrument": "NQ", "change_pct": "+1.2%", "context": "raison", "trend": "up | down" }
  ]
}

RÈGLES: Niveaux CONCRETS sur NQ. Recap sessions US 2-3 jours. Top movers: NQ, ES, RTY, DXY, WTI, Gold, 10Y, VIX minimum. CHIFFRÉ et ACTIONABLE.`;

const PROMPT_NEWS = `Tu es un analyste macro/flux senior pour un scalper NQ.
RÉPONDS UNIQUEMENT EN JSON VALIDE. Pas de markdown, pas de backticks.

{
  "news": [
    {
      "id": "1",
      "title": "Titre court",
      "summary": "2-3 phrases: la news, impact marché, direction",
      "category": "nq_es | rty | forex | commodities | bonds | calendar",
      "impact": "high | medium | low",
      "bias": "bullish | bearish | neutral",
      "time": "timing relatif",
      "source": "source",
      "instruments": ["NQ", "ES"]
    }
  ]
}

RÈGLES: MINIMUM 10 news. Couvrir toutes catégories (tech/NQ, small caps/RTY, forex, commodities, bonds). Focus sur ce qui drive la volatilité. Chaque news doit expliquer l'IMPACT sur les instruments.`;

const PROMPT_CALENDAR = `Tu es un analyste macro/flux senior pour un scalper NQ.
RÉPONDS UNIQUEMENT EN JSON VALIDE. Pas de markdown, pas de backticks.

{
  "upcoming_events": [
    {
      "event": "Nom",
      "date": "Date + heure CET",
      "impact": "high | medium | low",
      "affected": ["NQ", "ES", "DXY"],
      "consensus": "Prévision consensus",
      "previous": "Donnée précédente",
      "if_above": "Si > consensus: bull/bear sur quoi, pourquoi",
      "if_below": "Si < consensus: bull/bear sur quoi, pourquoi"
    }
  ]
}

RÈGLES: Cherche le calendrier éco de la semaine. Pour CHAQUE event: consensus, previous, scénarios if_above/if_below. Filtre les events IMPORTANTS (NFP, CPI, PPI, FOMC, PMI, retail sales, jobless claims, etc). Minimum 5 events.`;

async function callAPI(systemPrompt, userMessage) {
  const response = await fetch("/api/briefing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Timeout serveur — réessaie");
  }
  if (result.error) throw new Error(result.error.message);
  let fullText = "";
  for (const block of result.content || []) {
    if (block.type === "text" && block.text) fullText += block.text;
  }
  const cleaned = fullText.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Pas de JSON valide");
  return JSON.parse(match[0]);
}

function buildDiscordPayload(data) {
  if (!data) return null;
  const sentColor = data.verdict?.bias === "BULLISH" ? 0x00e676 :
                    data.verdict?.bias === "BEARISH" ? 0xff5252 : 0xffa726;
  const biasEmoji = data.verdict?.bias === "BULLISH" ? "🟢" :
                    data.verdict?.bias === "BEARISH" ? "🔴" : "🟡";
  const moversText = data.top_movers?.slice(0, 8).map(m =>
    `${m.trend === "up" ? "▲" : "▼"} **${m.instrument}** ${m.change_pct} — ${m.context}`
  ).join("\n") || "—";
  const highNews = data.news?.filter(n => n.impact === "high").slice(0, 5).map(n =>
    `${n.bias === "bullish" ? "🟢" : n.bias === "bearish" ? "🔴" : "⚪"} **${n.title}**\n> ${n.summary?.slice(0, 150)}`
  ).join("\n\n") || "Aucune news high impact";
  const eventsText = data.upcoming_events?.filter(e => e.impact === "high").slice(0, 5).map(e =>
    `⏰ **${e.event}** — ${e.date}\nConsensus: ${e.consensus || "—"} | Prev: ${e.previous || "—"}\n📈 Si > : ${e.if_above || "—"}\n📉 Si < : ${e.if_below || "—"}`
  ).join("\n\n") || "—";
  const scenarios = data.verdict?.scenarios?.map(s =>
    `**${s.label}** (${s.probability})\nTrigger: ${s.trigger}\nTarget: ${s.target}\n${s.description}`
  ).join("\n\n") || "—";
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return {
    content: `# ⚡ FLOW BRIEFING — ${dateStr.toUpperCase()}`,
    embeds: [
      {
        title: `${biasEmoji} VERDICT: ${data.verdict?.bias || "—"} (${data.verdict?.confidence || "—"})`,
        description: data.verdict?.summary || "—", color: sentColor,
        fields: [
          { name: "🎯 Niveaux NQ", value: data.verdict?.key_levels_nq || "—", inline: false },
          { name: "📊 Sentiment", value: `${data.market_pulse?.sentiment?.toUpperCase() || "—"} (${data.market_pulse?.sentiment_score || "—"}/10)`, inline: true },
          { name: "📈 VIX", value: data.market_pulse?.vix_context || "—", inline: true },
          { name: "💰 Flux", value: data.market_pulse?.flow_direction || "—", inline: false },
        ],
        footer: { text: "Flow Briefing" }, timestamp: now.toISOString(),
      },
      { title: "📋 Session US Veille", description: data.market_pulse?.session_recap || "—", color: 0x1a1a2e },
      { title: "🎯 Scénarios", description: scenarios, color: sentColor },
      { title: "🔥 Top Movers", description: moversText, color: 0x1a1a2e },
      { title: "⚠️ News High Impact", description: highNews, color: 0xff4444 },
      { title: "📅 Calendrier Éco", description: eventsText, color: 0xf472b6 },
    ],
  };
}

async function sendToDiscord(url, data) {
  const payload = buildDiscordPayload(data);
  if (!payload) throw new Error("No data");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Discord ${res.status}`);
}
export default function App() {
  const [pulse, setPulse] = useState(null);
  const [news, setNews] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState({ pulse: false, news: false, calendar: false });
  const [errors, setErrors] = useState({ pulse: null, news: null, calendar: null });
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedNews, setExpandedNews] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [webhook, setWebhook] = useState("");
  const [tempWebhook, setTempWebhook] = useState("");
  const [autoDiscord, setAutoDiscord] = useState(false);
  const [tempAutoDiscord, setTempAutoDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    try {
      setWebhook(localStorage.getItem("flow_webhook") || "");
      setAutoDiscord(localStorage.getItem("flow_auto_discord") === "true");
    } catch {}
  }, []);

  const openSettings = () => { setTempWebhook(webhook); setTempAutoDiscord(autoDiscord); setShowSettings(true); };
  const saveSettings = () => {
    setWebhook(tempWebhook); setAutoDiscord(tempAutoDiscord);
    try { localStorage.setItem("flow_webhook", tempWebhook); localStorage.setItem("flow_auto_discord", tempAutoDiscord.toString()); } catch {}
    setShowSettings(false);
  };

  const handleSendDiscord = async (allData) => {
    const hook = localStorage.getItem("flow_webhook") || webhook;
    if (!hook) return;
    setDiscordStatus("sending");
    try {
      await sendToDiscord(hook, allData || { market_pulse: pulse?.market_pulse, verdict: pulse?.verdict, top_movers: pulse?.top_movers, news: news?.news, upcoming_events: calendar?.upcoming_events });
      setDiscordStatus("sent"); setTimeout(() => setDiscordStatus(null), 3000);
    } catch { setDiscordStatus("error"); setTimeout(() => setDiscordStatus(null), 4000); }
  };

  const fetchBriefing = useCallback(async () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const userCtx = `Nous sommes le ${dateStr}, ${timeStr} CET. Scalper NQ, volatilité London/US Open.`;

    setPulse(null); setNews(null); setCalendar(null);
    setErrors({ pulse: null, news: null, calendar: null });

    // CALL 1 — Pulse + Verdict + Movers
    setLoading(p => ({ ...p, pulse: true }));
    setProgress("① Analyse macro & verdict...");
    try {
      const r1 = await callAPI(PROMPT_PULSE, userCtx + " Donne le market pulse, verdict et top movers. Cherche les données actuelles des marchés, VIX, sessions US récentes.");
      setPulse(r1);
    } catch (e) { setErrors(p => ({ ...p, pulse: e.message })); }
    setLoading(p => ({ ...p, pulse: false }));

    // CALL 2 — News
    setLoading(p => ({ ...p, news: true }));
    setProgress("② Scan des news...");
    try {
      const r2 = await callAPI(PROMPT_NEWS, userCtx + " Cherche les dernières news macro/financières qui impactent NQ, ES, RTY, Forex, Commodities, Bonds.");
      setNews(r2);
    } catch (e) { setErrors(p => ({ ...p, news: e.message })); }
    setLoading(p => ({ ...p, news: false }));

    // CALL 3 — Calendar
    setLoading(p => ({ ...p, calendar: true }));
    setProgress("③ Calendrier économique...");
    try {
      const r3 = await callAPI(PROMPT_CALENDAR, userCtx + " Cherche le calendrier économique de cette semaine sur investing.com. Events importants avec consensus et prévisions.");
      setCalendar(r3);
    } catch (e) { setErrors(p => ({ ...p, calendar: e.message })); }
    setLoading(p => ({ ...p, calendar: false }));

    setProgress("");
    setLastRefresh(new Date());

    // Auto Discord
    try {
      const hook = localStorage.getItem("flow_webhook");
      const auto = localStorage.getItem("flow_auto_discord") === "true";
      if (hook && auto) {
        setTimeout(() => handleSendDiscord(), 500);
      }
    } catch {}
  }, []);

  const isLoading = loading.pulse || loading.news || loading.calendar;
  const hasAnyData = pulse || news || calendar;

  const filteredNews = news?.news?.filter((n) => {
    const matchCat = activeFilter === "all" || n.category === activeFilter;
    const matchSearch = !searchQuery ||
      n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.instruments?.some(i => i.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const toggleExpand = (id) => {
    setExpandedNews(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const gc = (c) => CATS.find(x => x.id === c)?.color || "#555";
  const gi = (c) => CATS.find(x => x.id === c)?.icon || "•";
  const ic = (i) => i === "high" ? "#ff4444" : i === "medium" ? "#ffa726" : "#555";
  const bc = (b) => b === "bullish" ? "#00e676" : b === "bearish" ? "#ff5252" : "#78909c";
  const bl = (b) => b === "bullish" ? "▲ BULL" : b === "bearish" ? "▼ BEAR" : "— NEUTRE";
return (
    <div className="root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        :root {
          --bg: #07080c; --bg2: #0c0e14; --bg3: #12151e;
          --border: #1a1e2e; --border2: #252a3a;
          --text: #c4c8d4; --text2: #6b7084; --text3: #3d4156;
          --cyan: #00d4ff; --green: #00e676; --red: #ff5252; --orange: #ffa726; --pink: #f472b6;
          --mono: 'IBM Plex Mono', monospace; --sans: 'DM Sans', sans-serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); }
        .root { font-family: var(--sans); background: var(--bg); color: var(--text); min-height: 100vh; }
        .header { display:flex; justify-content:space-between; align-items:center; padding:16px 24px; border-bottom:1px solid var(--border); background:rgba(7,8,12,0.95); backdrop-filter:blur(12px); position:sticky; top:0; z-index:50; flex-wrap:wrap; gap:10px; }
        .logo-area { display:flex; align-items:center; gap:12px; }
        .logo-mark { width:32px; height:32px; border-radius:6px; background:linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,212,255,0.05)); border:1px solid rgba(0,212,255,0.25); display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--cyan); }
        .logo-text { font-family:var(--mono); font-size:13px; font-weight:600; color:#fff; letter-spacing:2px; }
        .logo-sub { font-size:10px; color:var(--text3); margin-top:1px; }
        .header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .time-badge { font-family:var(--mono); font-size:10px; color:var(--text3); }
        .btn { font-family:var(--mono); font-size:11px; font-weight:500; padding:7px 16px; border-radius:5px; cursor:pointer; transition:all 0.15s; border:none; }
        .btn-primary { background:rgba(0,212,255,0.1); border:1px solid rgba(0,212,255,0.25); color:var(--cyan); }
        .btn-primary:hover { background:rgba(0,212,255,0.18); transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.4; cursor:default; transform:none; }
        .btn-ghost { background:transparent; border:1px solid var(--border); color:var(--text2); padding:7px 10px; }
        .btn-ghost:hover { border-color:var(--border2); color:var(--text); }
        .btn-discord { background:rgba(88,101,242,0.12); border:1px solid rgba(88,101,242,0.3); color:#7289da; }
        .btn-discord:hover { background:rgba(88,101,242,0.2); }
        .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:70vh; text-align:center; padding:40px; }
        .empty-icon { font-size:40px; opacity:0.15; margin-bottom:24px; }
        .empty h2 { font-family:var(--mono); font-size:18px; color:#fff; letter-spacing:1.5px; margin-bottom:8px; }
        .empty p { font-size:13px; color:var(--text3); max-width:380px; line-height:1.6; margin-bottom:28px; }
        .btn-start { font-family:var(--mono); font-size:14px; font-weight:600; padding:14px 40px; border-radius:8px; cursor:pointer; background:linear-gradient(135deg,rgba(0,212,255,0.12),rgba(0,212,255,0.04)); border:1px solid rgba(0,212,255,0.3); color:var(--cyan); letter-spacing:1px; transition:all 0.2s; }
        .btn-start:hover { transform:scale(1.02); box-shadow:0 0 30px rgba(0,212,255,0.15); }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .skel { background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:6px; }
        .content { padding:20px 24px 40px; max-width:1200px; margin:0 auto; }
        .progress-bar { padding:12px 24px; font-family:var(--mono); font-size:11px; color:var(--cyan); background:rgba(0,212,255,0.04); border-bottom:1px solid var(--border); }
        .verdict-card { background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:20px 24px; margin-bottom:20px; position:relative; overflow:hidden; }
        .verdict-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
        .verdict-card.bull::before { background:linear-gradient(90deg,transparent,var(--green),transparent); }
        .verdict-card.bear::before { background:linear-gradient(90deg,transparent,var(--red),transparent); }
        .verdict-card.neutral::before { background:linear-gradient(90deg,transparent,var(--orange),transparent); }
        .verdict-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-wrap:wrap; gap:10px; }
        .verdict-bias { font-family:var(--mono); font-size:20px; font-weight:700; letter-spacing:2px; }
        .verdict-conf { font-family:var(--mono); font-size:10px; padding:3px 10px; border-radius:4px; font-weight:600; }
        .verdict-summary { font-size:13px; line-height:1.7; color:var(--text); margin-bottom:16px; }
        .verdict-levels { font-family:var(--mono); font-size:11px; color:var(--cyan); background:rgba(0,212,255,0.05); border:1px solid rgba(0,212,255,0.1); border-radius:6px; padding:10px 14px; margin-bottom:16px; }
        .scenarios { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .scenario { background:rgba(255,255,255,0.015); border:1px solid var(--border); border-radius:8px; padding:14px; }
        .scenario-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
        .scenario-label { font-family:var(--mono); font-size:11px; font-weight:700; }
        .scenario-prob { font-family:var(--mono); font-size:11px; font-weight:600; }
        .scenario-trigger { font-size:11px; color:var(--text2); margin-bottom:4px; }
        .scenario-target { font-family:var(--mono); font-size:10px; color:var(--cyan); margin-bottom:4px; }
        .scenario-desc { font-size:11px; color:var(--text3); }
        .pulse-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px; }
        .pulse-card { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:14px; }
        .pulse-label { font-family:var(--mono); font-size:9px; font-weight:600; color:var(--text3); letter-spacing:1.5px; margin-bottom:6px; }
        .pulse-val { font-family:var(--mono); font-size:16px; font-weight:700; }
        .pulse-text { font-size:11px; line-height:1.5; color:var(--text2); }
        .session-recap { background:var(--bg2); border:1px solid var(--border); border-left:2px solid var(--cyan); border-radius:0 8px 8px 0; padding:14px 16px; margin-bottom:20px; }
        .session-recap p { font-size:12px; line-height:1.6; color:var(--text); }
        .section-title { font-family:var(--mono); font-size:10px; font-weight:600; color:var(--text3); letter-spacing:2px; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
        .movers-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:6px; margin-bottom:20px; }
        .mover { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:10px 12px; transition:all 0.15s; }
        .mover:hover { transform:translateY(-1px); border-color:var(--border2); }
        .mover-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
        .mover-name { font-family:var(--mono); font-size:11px; font-weight:600; color:#fff; }
        .mover-pct { font-family:var(--mono); font-size:12px; font-weight:700; }
        .mover-ctx { font-size:10px; color:var(--text3); line-height:1.3; }
        .filters { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
        .filter-row { display:flex; gap:4px; flex-wrap:wrap; }
        .fbtn { font-family:var(--mono); font-size:10px; padding:5px 10px; border-radius:4px; cursor:pointer; border:1px solid var(--border); background:transparent; color:var(--text3); transition:all 0.12s; }
        .fbtn:hover { border-color:var(--border2); color:var(--text2); }
        .fbtn.active { border-color:var(--cyan); color:var(--cyan); background:rgba(0,212,255,0.06); }
        .search-input { font-family:var(--mono); font-size:11px; padding:6px 12px; background:var(--bg2); border:1px solid var(--border); border-radius:5px; color:var(--text); outline:none; width:200px; }
        .news-list { display:flex; flex-direction:column; gap:3px; margin-bottom:24px; }
        .news-item { padding:10px 14px; background:var(--bg2); border-left:2px solid var(--border); border-radius:0 6px 6px 0; cursor:pointer; transition:all 0.12s; }
        .news-item:hover { background:var(--bg3); transform:translateX(2px); }
        .news-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .news-left { display:flex; align-items:center; gap:8px; flex:1; min-width:0; }
        .news-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .impact-tag { font-family:var(--mono); font-size:8px; font-weight:700; padding:2px 6px; border-radius:3px; flex-shrink:0; }
        .news-title { font-size:12px; font-weight:500; color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bias-tag { font-family:var(--mono); font-size:9px; font-weight:700; }
        .news-time { font-family:var(--mono); font-size:9px; color:var(--text3); white-space:nowrap; }
        .news-body { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
        .news-summary { font-size:11px; line-height:1.6; color:var(--text2); margin-bottom:8px; }
        .news-tags { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
        .inst-tag { font-family:var(--mono); font-size:9px; padding:2px 7px; border-radius:3px; background:rgba(0,212,255,0.06); border:1px solid rgba(0,212,255,0.1); color:var(--cyan); }
        .news-src { font-size:9px; color:var(--text3); font-style:italic; margin-left:auto; }
        .events-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:8px; }
        .event-card { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:14px; }
        .event-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .event-date { font-family:var(--mono); font-size:10px; color:var(--text3); }
        .event-name { font-size:13px; font-weight:600; color:#ddd; margin-bottom:6px; }
        .event-row { font-size:10px; color:var(--text2); margin-bottom:3px; font-family:var(--mono); }
        .event-row span { color:var(--text); }
        .event-scenario { font-size:10px; line-height:1.4; margin-bottom:3px; padding:4px 8px; border-radius:4px; }
        .event-bull { background:rgba(0,230,118,0.06); color:var(--green); }
        .event-bear { background:rgba(255,82,82,0.06); color:var(--red); }
        .event-affected { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation:fadeUp 0.25s ease both; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:center; justify-content:center; }
        .modal { background:var(--bg2); border:1px solid var(--border2); border-radius:12px; padding:28px; width:420px; max-width:90vw; }
        .modal h3 { font-family:var(--mono); font-size:13px; color:#fff; letter-spacing:1px; margin-bottom:20px; }
        .modal label { font-size:11px; color:var(--text2); display:block; margin-bottom:6px; }
        .modal-input { width:100%; padding:8px 12px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); font-family:var(--mono); font-size:11px; outline:none; margin-bottom:16px; }
        .toggle-row { display:flex; align-items:center; gap:10px; margin-bottom:20px; }
        .toggle { width:36px; height:20px; border-radius:10px; cursor:pointer; background:var(--border); position:relative; transition:background 0.2s; border:none; flex-shrink:0; }
        .toggle.on { background:rgba(0,212,255,0.4); }
        .toggle::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform 0.2s; }
        .toggle.on::after { transform:translateX(16px); }
        .modal-actions { display:flex; justify-content:flex-end; gap:8px; }
        .footer { padding:14px 24px; border-top:1px solid var(--border); display:flex; justify-content:space-between; font-family:var(--mono); font-size:9px; color:var(--text3); }
        .error-box { margin:8px 0; padding:10px 14px; background:rgba(255,82,82,0.06); border:1px solid rgba(255,82,82,0.15); border-radius:6px; font-size:11px; color:var(--red); display:flex; justify-content:space-between; align-items:center; }
        .discord-toast { position:fixed; bottom:20px; right:20px; padding:10px 18px; border-radius:8px; font-family:var(--mono); font-size:11px; z-index:200; animation:fadeUp 0.3s ease; }
        .discord-toast.sending { background:rgba(88,101,242,0.2); border:1px solid rgba(88,101,242,0.3); color:#7289da; }
        .discord-toast.sent { background:rgba(0,230,118,0.15); border:1px solid rgba(0,230,118,0.25); color:var(--green); }
        .discord-toast.error { background:rgba(255,82,82,0.12); border:1px solid rgba(255,82,82,0.2); color:var(--red); }
        @media(max-width:768px) { .pulse-grid{grid-template-columns:1fr} .scenarios{grid-template-columns:1fr} .events-grid{grid-template-columns:1fr} .content{padding:16px} .search-input{width:140px} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
      `}</style>

      <header className="header">
        <div className="logo-area">
          <div className="logo-mark">⚡</div>
          <div><div className="logo-text">FLOW BRIEFING</div><div className="logo-sub">Macro · Volatility · Flux</div></div>
        </div>
        <div className="header-actions">
          {lastRefresh && <span className="time-badge">{lastRefresh.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span>}
          {hasAnyData && webhook && (
            <button className="btn btn-discord" onClick={() => handleSendDiscord()}>
              {discordStatus === "sending" ? "Envoi..." : "📨 Discord"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={openSettings}>⚙</button>
          <button className="btn btn-primary" onClick={fetchBriefing} disabled={isLoading}>
            {isLoading ? "◌ Scan..." : "↻ Scanner"}
          </button>
        </div>
      </header>

      {progress && <div className="progress-bar">{progress}</div>}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>⚙ PARAMÈTRES</h3>
            <label>Webhook Discord</label>
            <input className="modal-input" type="text" placeholder="https://discord.com/api/webhooks/..." value={tempWebhook} onChange={e => setTempWebhook(e.target.value)} />
            <div className="toggle-row">
              <button className={`toggle ${tempAutoDiscord?"on":""}`} onClick={() => setTempAutoDiscord(!tempAutoDiscord)} />
              <span style={{fontSize:11,color:"var(--text2)"}}>Envoyer auto sur Discord après chaque scan</span>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveSettings}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {discordStatus && (
        <div className={`discord-toast ${discordStatus}`}>
          {discordStatus==="sending"&&"📨 Envoi..."}{discordStatus==="sent"&&"✓ Envoyé"}{discordStatus==="error"&&"✗ Erreur webhook"}
        </div>
      )}
      {!hasAnyData && !isLoading && (
        <div className="empty">
          <div className="empty-icon">⚡</div>
          <h2>FLOW BRIEFING</h2>
          <p>Scan les marchés en 3 étapes : macro & verdict, news, calendrier éco. Résultats progressifs.</p>
          <button className="btn-start" onClick={fetchBriefing}>Scanner les marchés</button>
        </div>
      )}

      <div className="content">
        {/* PULSE LOADING */}
        {loading.pulse && !pulse && (
          <div><div className="skel" style={{height:120,marginBottom:16}} /><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:80}} />)}</div></div>
        )}
        {errors.pulse && <div className="error-box">⚠ Pulse: {errors.pulse}</div>}

        {/* VERDICT */}
        {pulse?.verdict && (
          <div className={`verdict-card fade-up ${pulse.verdict.bias==="BULLISH"?"bull":pulse.verdict.bias==="BEARISH"?"bear":"neutral"}`}>
            <div className="verdict-header">
              <div className="verdict-bias" style={{color:pulse.verdict.bias==="BULLISH"?"var(--green)":pulse.verdict.bias==="BEARISH"?"var(--red)":"var(--orange)"}}>
                {pulse.verdict.bias==="BULLISH"?"▲ ":pulse.verdict.bias==="BEARISH"?"▼ ":"— "}{pulse.verdict.bias||"—"}
              </div>
              <div className="verdict-conf" style={{
                background:pulse.verdict.confidence==="HIGH"?"rgba(0,230,118,0.1)":pulse.verdict.confidence==="MEDIUM"?"rgba(255,167,38,0.1)":"rgba(255,82,82,0.1)",
                color:pulse.verdict.confidence==="HIGH"?"var(--green)":pulse.verdict.confidence==="MEDIUM"?"var(--orange)":"var(--red)",
                border:`1px solid ${pulse.verdict.confidence==="HIGH"?"rgba(0,230,118,0.2)":pulse.verdict.confidence==="MEDIUM"?"rgba(255,167,38,0.2)":"rgba(255,82,82,0.2)"}`
              }}>CONF: {pulse.verdict.confidence||"—"}</div>
            </div>
            <p className="verdict-summary">{pulse.verdict.summary}</p>
            {pulse.verdict.key_levels_nq && <div className="verdict-levels">🎯 {pulse.verdict.key_levels_nq}</div>}
            {pulse.verdict.scenarios?.length>0 && (
              <div className="scenarios">
                {pulse.verdict.scenarios.map((s,i) => (
                  <div key={i} className="scenario">
                    <div className="scenario-head">
                      <span className="scenario-label" style={{color:s.label?.includes("BULL")?"var(--green)":"var(--red)"}}>{s.label}</span>
                      <span className="scenario-prob" style={{color:"var(--cyan)"}}>{s.probability}</span>
                    </div>
                    <div className="scenario-trigger">Trigger: {s.trigger}</div>
                    <div className="scenario-target">Target: {s.target}</div>
                    <div className="scenario-desc">{s.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {pulse?.market_pulse?.session_recap && (
          <div className="session-recap fade-up"><div className="pulse-label">📋 SESSION US — RECAP</div><p>{pulse.market_pulse.session_recap}</p></div>
        )}

        {pulse?.market_pulse && (
          <div className="pulse-grid">
            <div className="pulse-card fade-up"><div className="pulse-label">SENTIMENT</div>
              <div className="pulse-val" style={{color:pulse.market_pulse.sentiment==="risk-on"?"var(--green)":pulse.market_pulse.sentiment==="risk-off"?"var(--red)":"var(--orange)"}}>
                {pulse.market_pulse.sentiment?.toUpperCase()||"—"}<span style={{fontSize:11,opacity:0.6,marginLeft:6}}>{pulse.market_pulse.sentiment_score}/10</span>
              </div>
            </div>
            <div className="pulse-card fade-up"><div className="pulse-label">VIX / VOL</div><div className="pulse-text">{pulse.market_pulse.vix_context||"—"}</div></div>
            <div className="pulse-card fade-up"><div className="pulse-label">FLUX DOMINANTS</div><div className="pulse-text">{pulse.market_pulse.flow_direction||"—"}</div></div>
          </div>
        )}

        {pulse?.market_pulse?.key_theme && (
          <div style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:8,padding:"12px 16px",marginBottom:20,fontSize:12,lineHeight:1.6}} className="fade-up">
            <span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--text3)",letterSpacing:"1.5px"}}>THÈME DU JOUR</span>
            <p style={{marginTop:6}}>{pulse.market_pulse.key_theme}</p>
          </div>
        )}

        {pulse?.top_movers?.length>0 && (
          <><div className="section-title"><span style={{color:"var(--orange)"}}>●</span> TOP MOVERS</div>
          <div className="movers-grid">
            {pulse.top_movers.map((m,i) => (
              <div key={i} className="mover fade-up" style={{animationDelay:`${i*30}ms`}}>
                <div className="mover-top"><span className="mover-name">{m.instrument}</span><span className="mover-pct" style={{color:m.trend==="up"?"var(--green)":"var(--red)"}}>{m.change_pct}</span></div>
                <div className="mover-ctx">{m.context}</div>
              </div>
            ))}
          </div></>
        )}

        {/* NEWS LOADING */}
        {loading.news && !news && <>{[1,2,3,4,5].map(i=><div key={i} className="skel" style={{height:48,marginBottom:4}} />)}</>}
        {errors.news && <div className="error-box">⚠ News: {errors.news}</div>}

        {news?.news?.length>0 && (
          <>
            <div className="filters">
              <div className="filter-row">
                <button className={`fbtn ${activeFilter==="all"?"active":""}`} onClick={()=>setActiveFilter("all")}>ALL</button>
                {CATS.map(c=><button key={c.id} className={`fbtn ${activeFilter===c.id?"active":""}`} onClick={()=>setActiveFilter(c.id)} style={activeFilter===c.id?{borderColor:c.color,color:c.color,background:`${c.color}0a`}:{}}>{c.icon} {c.label}</button>)}
              </div>
              <input className="search-input" placeholder="Rechercher..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
            </div>
            <div className="news-list">
              {filteredNews?.length===0 && <div style={{padding:24,textAlign:"center",color:"var(--text3)",fontSize:12}}>Aucune news pour ce filtre</div>}
              {filteredNews?.map((n,i) => (
                <div key={n.id||i} className="news-item fade-up" onClick={()=>toggleExpand(n.id||i)} style={{borderLeftColor:gc(n.category),animationDelay:`${i*25}ms`}}>
                  <div className="news-head">
                    <div className="news-left">
                      <span style={{color:gc(n.category),fontSize:10}}>{gi(n.category)}</span>
                      <span className="impact-tag" style={{background:`${ic(n.impact)}15`,color:ic(n.impact),border:`1px solid ${ic(n.impact)}30`}}>{n.impact?.toUpperCase()}</span>
                      <span className="news-title">{n.title}</span>
                    </div>
                    <div className="news-right">
                      <span className="bias-tag" style={{color:bc(n.bias)}}>{bl(n.bias)}</span>
                      <span className="news-time">{n.time}</span>
                    </div>
                  </div>
                  {expandedNews.has(n.id||i) && (
                    <div className="news-body">
                      <p className="news-summary">{n.summary}</p>
                      <div className="news-tags">
                        {n.instruments?.map(t=><span key={t} className="inst-tag">{t}</span>)}
                        {n.source && <span className="news-src">{n.source}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* CALENDAR LOADING */}
        {loading.calendar && !calendar && <>{[1,2,3].map(i=><div key={i} className="skel" style={{height:80,marginBottom:8}} />)}</>}
        {errors.calendar && <div className="error-box">⚠ Calendrier: {errors.calendar}</div>}

        {calendar?.upcoming_events?.length>0 && (
          <>
            <div className="section-title" style={{marginTop:8}}><span style={{color:"var(--pink)"}}>◰</span> CALENDRIER ÉCO</div>
            <div className="events-grid">
              {calendar.upcoming_events.map((e,i) => (
                <div key={i} className="event-card fade-up" style={{animationDelay:`${i*30}ms`}}>
                  <div className="event-top">
                    <span className="impact-tag" style={{background:`${ic(e.impact)}15`,color:ic(e.impact),border:`1px solid ${ic(e.impact)}30`}}>{e.impact?.toUpperCase()}</span>
                    <span className="event-date">{e.date}</span>
                  </div>
                  <div className="event-name">{e.event}</div>
                  {(e.consensus||e.previous) && <div style={{marginBottom:6}}>{e.consensus&&<div className="event-row">Consensus: <span>{e.consensus}</span></div>}{e.previous&&<div className="event-row">Précédent: <span>{e.previous}</span></div>}</div>}
                  {e.if_above && <div className="event-scenario event-bull">📈 {e.if_above}</div>}
                  {e.if_below && <div className="event-scenario event-bear">📉 {e.if_below}</div>}
                  <div className="event-affected">{e.affected?.map(a=><span key={a} className="inst-tag">{a}</span>)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="footer"><span>FLOW BRIEFING · NQ SCALPER</span><span>Claude Haiku + Web Search</span></footer>
    </div>
  );
}
