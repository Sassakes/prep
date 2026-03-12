import { useState, useEffect, useCallback } from "react";

/* ── System prompt for Claude ── */
var SYSTEM_PROMPT =
  "Tu es un analyste macro senior pour un scalper de volatilité sur NQ (Nasdaq futures)." +
  "\n\nRÈGLE ABSOLUE: Réponds UNIQUEMENT en JSON valide. Aucun texte avant ou après le JSON. Pas de backticks." +
  "\n\nStructure JSON exacte à respecter:" +
  '\n{' +
  '\n  "movers": [' +
  '\n    {"name": "NQ", "price": "20000", "pct": "+0.5%", "dir": "up"}' +
  '\n  ],' +
  '\n  "verdict": {' +
  '\n    "bias": "BULLISH",' +
  '\n    "confidence": "HIGH",' +
  '\n    "summary": "3-5 phrases tradables avec niveaux concrets",' +
  '\n    "levels": "R:XXXXX Pivot:XXXXX S:XXXXX",' +
  '\n    "bull_scenario": "Scenario bull 2 phrases avec trigger et target",' +
  '\n    "bear_scenario": "Scenario bear 2 phrases avec trigger et target"' +
  '\n  },' +
  '\n  "flows": "Analyse des flux dominants 2-3 phrases",' +
  '\n  "correlations": "Correlations intermarche DXY/NQ yields oil gold 2 phrases",' +
  '\n  "news": [' +
  '\n    {"t": "titre court", "i": "high", "b": "bullish", "s": "resume 1 phrase"}' +
  '\n  ],' +
  '\n  "events": [' +
  '\n    {"n": "Nom event", "d": "JJ/MM HH:MM CET", "c": "consensus", "above": "impact si superieur", "below": "impact si inferieur"}' +
  '\n  ]' +
  '\n}' +
  "\n\nRègles:" +
  "\n- Minimum 9 movers: NQ, ES, RTY, VIX, DXY, WTI, Gold, 10Y, EUR/USD" +
  "\n- Minimum 5 news avec impact sur NQ/ES" +
  "\n- Minimum 3 events eco de la semaine avec consensus et scenarios" +
  "\n- Prix REALISTES basés sur tes connaissances et les titres fournis" +
  "\n- Verdict ACTIONABLE: niveaux, triggers, conditions pour scalp NQ" +
  "\n- Analyse intermarche: DXY vs NQ, yields vs equity, VIX level, oil/gold" +
  "\n- JSON VALIDE: pas de virgule avant } ou ]";

/* ── Session countdown ── */
function getSessions() {
  var now = new Date();
  var cet;
  try {
    cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  } catch (e) {
    cet = now;
  }
  var currentMinutes = cet.getHours() * 60 + cet.getMinutes();
  var list = [
    { name: "London", mins: 540 },
    { name: "EU Overlap", mins: 840 },
    { name: "US Data", mins: 870 },
    { name: "US Open", mins: 930 },
    { name: "Power Hour", mins: 1260 },
    { name: "Close", mins: 1320 }
  ];
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var diff = s.mins - currentMinutes;
    var status = "wait";
    var label = "";
    if (diff < -30) {
      status = "done";
      label = "";
    } else if (diff < 0) {
      status = "live";
      label = "LIVE";
    } else if (diff < 60) {
      status = "soon";
      label = diff + "min";
    } else {
      var hours = Math.floor(diff / 60);
      var mins = diff % 60;
      label = hours + "h" + String(mins).padStart(2, "0");
    }
    var hh = Math.floor(s.mins / 60);
    var mm = s.mins % 60;
    result.push({
      name: s.name,
      status: status,
      label: label,
      time: String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0")
    });
  }
  return result;
}

/* ── Fix common JSON issues from LLM output ── */
function safeParseJSON(str) {
  // Remove markdown code fences
  var cleaned = str.replace(/```json/g, "").replace(/```/g, "").trim();

  // Extract JSON object
  var match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  var jsonStr = match[0];

  // Try direct parse first
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Fix trailing commas before } and ]
    var fixed = jsonStr.replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      return null;
    }
  }
}

/* ── Discord webhook ── */
function buildDiscordPayload(data) {
  if (!data) return null;

  var v = data.verdict;
  if (!v) v = {};

  var color = 0xffa726;
  var emoji = "🟡";
  if (v.bias === "BULLISH") { color = 0x00e676; emoji = "🟢"; }
  if (v.bias === "BEARISH") { color = 0xff5252; emoji = "🔴"; }

  var moversLines = [];
  if (data.movers) {
    for (var i = 0; i < data.movers.length; i++) {
      var m = data.movers[i];
      var arrow = m.dir === "up" ? "▲" : "▼";
      moversLines.push(arrow + " **" + m.name + "** " + m.price + " (" + m.pct + ")");
    }
  }
  var moversText = moversLines.length > 0 ? moversLines.join("\n") : "—";

  var newsLines = [];
  if (data.news) {
    for (var j = 0; j < data.news.length && j < 6; j++) {
      var n = data.news[j];
      var icon = n.b === "bullish" ? "🟢" : n.b === "bearish" ? "🔴" : "⚪";
      newsLines.push(icon + " **" + n.t + "** " + n.s);
    }
  }
  var newsText = newsLines.length > 0 ? newsLines.join("\n") : "—";

  var eventsLines = [];
  if (data.events) {
    for (var k = 0; k < data.events.length && k < 5; k++) {
      var ev = data.events[k];
      eventsLines.push("⏰ **" + ev.n + "** " + ev.d);
      if (ev.above) eventsLines.push("📈 " + ev.above);
      if (ev.below) eventsLines.push("📉 " + ev.below);
      eventsLines.push("");
    }
  }
  var eventsText = eventsLines.length > 0 ? eventsLines.join("\n") : "—";

  var scenariosText = "";
  if (v.bull_scenario) scenariosText += "**BULL:** " + v.bull_scenario;
  if (v.bear_scenario) scenariosText += "\n\n**BEAR:** " + v.bear_scenario;
  if (!scenariosText) scenariosText = "—";

  var dateStr = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  return {
    content: "# ⚡ FLOW BRIEFING — " + dateStr.toUpperCase(),
    embeds: [
      {
        title: emoji + " " + (v.bias || "—") + " (" + (v.confidence || "—") + ")",
        description: (v.summary || "—").slice(0, 1024),
        color: color,
        fields: [
          { name: "🎯 Niveaux", value: (v.levels || "—").slice(0, 200), inline: false }
        ]
      },
      {
        title: "🎯 Scénarios",
        description: scenariosText.slice(0, 1024),
        color: color
      },
      {
        title: "🔥 Movers",
        description: moversText.slice(0, 1024),
        color: 0x1a1a2e
      },
      {
        title: "⚠️ News",
        description: newsText.slice(0, 1024),
        color: 0xff4444
      },
      {
        title: "📅 Éco",
        description: eventsText.slice(0, 1024),
        color: 0xf472b6
      }
    ]
  };
}

/* ══════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════ */

export default function App() {
  var _d = useState(null);
  var data = _d[0];
  var setData = _d[1];

  var _l = useState(false);
  var loading = _l[0];
  var setLoading = _l[1];

  var _e = useState(null);
  var error = _e[0];
  var setError = _e[1];

  var _r = useState(null);
  var refreshed = _r[0];
  var setRefreshed = _r[1];

  var _s = useState(getSessions());
  var sess = _s[0];
  var setSess = _s[1];

  var _sh = useState(false);
  var showSettings = _sh[0];
  var setShowSettings = _sh[1];

  var _wh = useState("");
  var webhook = _wh[0];
  var setWebhook = _wh[1];

  var _tw = useState("");
  var tmpWebhook = _tw[0];
  var setTmpWebhook = _tw[1];

  var _ds = useState(null);
  var discordStatus = _ds[0];
  var setDiscordStatus = _ds[1];

  var _st = useState("");
  var step = _st[0];
  var setStep = _st[1];

  // Load saved webhook on mount
  useEffect(function () {
    try {
      var saved = localStorage.getItem("flow_wh");
      if (saved) setWebhook(saved);
    } catch (e) {
      // localStorage not available
    }
    var timer = setInterval(function () {
      setSess(getSessions());
    }, 60000);
    return function () {
      clearInterval(timer);
    };
  }, []);

  // Save webhook
  var saveWebhook = function () {
    setWebhook(tmpWebhook);
    try {
      localStorage.setItem("flow_wh", tmpWebhook);
    } catch (e) {
      // ignore
    }
    setShowSettings(false);
  };

  // Send to Discord
  var sendDiscord = async function (overrideData) {
    var url = webhook;
    try {
      var stored = localStorage.getItem("flow_wh");
      if (stored) url = stored;
    } catch (e) {
      // ignore
    }
    if (!url) return;

    setDiscordStatus("sending");
    try {
      var payload = buildDiscordPayload(overrideData || data);
      if (!payload) throw new Error("No data");
      var resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      setDiscordStatus("sent");
    } catch (e) {
      setDiscordStatus("error");
    }
    setTimeout(function () {
      setDiscordStatus(null);
    }, 3000);
  };

  // Main scan function
  var scan = useCallback(async function () {
    setLoading(true);
    setError(null);
    setData(null);
    setStep("Scan en cours...");

    var now = new Date();
    var dateStr = now.toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    var timeStr = now.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    var userMessage =
      dateStr + " " + timeStr + " CET. " +
      "Morning briefing complet pour scalper NQ. " +
      "Donne prix actuels, verdict, scenarios, niveaux, news, calendrier eco semaine.";

    try {
      var resp = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }]
        })
      });

      // Handle non-200 responses
      if (!resp.ok) {
        var errBody = "";
        try {
          errBody = await resp.text();
        } catch (e2) {
          errBody = "Unknown";
        }
        throw new Error("Serveur " + resp.status + ": " + errBody.slice(0, 200));
      }

      // Parse response
      var responseText = await resp.text();
      var result;
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        throw new Error("Réponse serveur non-JSON");
      }

      // Check for API error
      if (result.error) {
        var apiErr = typeof result.error === "string"
          ? result.error
          : (result.error.message || "Erreur API inconnue");
        throw new Error(apiErr);
      }

      // Extract text from Claude response
      var fullText = "";
      var blocks = result.content || [];
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].type === "text" && blocks[i].text) {
          fullText = fullText + blocks[i].text;
        }
      }

      if (!fullText) {
        throw new Error("Réponse Claude vide");
      }

      // Parse the JSON from Claude's response
      var parsed = safeParseJSON(fullText);
      if (!parsed) {
        throw new Error("JSON invalide dans la réponse Claude");
      }

      setData(parsed);
      setRefreshed(new Date());
      setSess(getSessions());

      // Auto Discord
      try {
        var hook = localStorage.getItem("flow_wh");
        if (hook) {
          setTimeout(function () {
            sendDiscord(parsed);
          }, 500);
        }
      } catch (autoErr) {
        // ignore
      }

    } catch (e) {
      setError(e.message || "Erreur inconnue");
    }

    setLoading(false);
    setStep("");
  }, []);

  // Helpers
  var isAnyData = data !== null;
  var sessionColor = function (status) {
    if (status === "live") return "#00e676";
    if (status === "soon") return "#ffa726";
    if (status === "done") return "#333";
    return "#555";
  };

  /* ── RENDER ── */
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#07080c", color: "#c4c8d4", minHeight: "100vh" }}>
      <style>{STYLES}</style>

      {/* HEADER */}
      <header className="hdr">
        <div className="logo">
          <div className="lm">⚡</div>
          <div>
            <div className="lt">FLOW BRIEFING</div>
            <div className="ls">Live · AI · Flux</div>
          </div>
        </div>
        <div className="acts">
          {refreshed && (
            <span className="tb">
              MàJ {refreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {isAnyData && webhook && (
            <button className="btn bd" onClick={function () { sendDiscord(null); }}>
              {discordStatus === "sending" ? "◌" : "📨"}
            </button>
          )}
          <button className="btn bg" onClick={function () { setTmpWebhook(webhook); setShowSettings(true); }}>
            ⚙
          </button>
          <button className="btn bp" onClick={scan} disabled={loading}>
            {loading ? "◌ Scan..." : "↻ Scanner"}
          </button>
        </div>
      </header>

      {/* PROGRESS */}
      {step && (
        <div className="prog">
          <span className="dot">●</span> {step}
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="mo" onClick={function () { setShowSettings(false); }}>
          <div className="md" onClick={function (e) { e.stopPropagation(); }}>
            <h3 className="mh">⚙ Paramètres</h3>
            <label className="ml">Webhook Discord</label>
            <input
              className="mi"
              value={tmpWebhook}
              onChange={function (e) { setTmpWebhook(e.target.value); }}
              placeholder="https://discord.com/api/webhooks/..."
            />
            <div className="ma">
              <button className="btn bg" onClick={function () { setShowSettings(false); }}>Annuler</button>
              <button className="btn bp" onClick={saveWebhook}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* DISCORD TOAST */}
      {discordStatus && (
        <div className={"toast " + discordStatus}>
          {discordStatus === "sending" ? "📨 Envoi..." : discordStatus === "sent" ? "✓ Envoyé" : "✗ Erreur"}
        </div>
      )}

      {/* EMPTY STATE */}
      {!isAnyData && !loading && !error && (
        <div className="empty">
          <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 24 }}>⚡</div>
          <h2 className="eh">FLOW BRIEFING</h2>
          <p className="ep">
            Données marché + News RSS + Analyse IA.<br />
            ~10 secondes, ~$0.005 par scan.
          </p>
          <div className="sp">
            {sess.filter(function (s) { return s.status !== "done"; }).slice(0, 4).map(function (s, idx) {
              return (
                <div key={idx} className="sch" style={{ borderColor: sessionColor(s.status), color: sessionColor(s.status) }}>
                  {s.name} <b>{s.label}</b>
                </div>
              );
            })}
          </div>
          <button className="bs" onClick={scan}>Scanner les marchés</button>
        </div>
      )}

      {/* ERROR STATE */}
      {error && !loading && (
        <div className="err">
          <div>⚠ {error}</div>
          <button className="btn bp" onClick={scan} style={{ marginTop: 12 }}>Réessayer</button>
        </div>
      )}

      {/* LOADING STATE */}
      {loading && !isAnyData && (
        <div className="ct">
          <div className="sk" style={{ height: 140, marginBottom: 12 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div className="sk" style={{ height: 80 }} />
            <div className="sk" style={{ height: 80 }} />
            <div className="sk" style={{ height: 80 }} />
          </div>
          <div className="sk" style={{ height: 44, marginBottom: 4 }} />
          <div className="sk" style={{ height: 44, marginBottom: 4 }} />
          <div className="sk" style={{ height: 44, marginBottom: 4 }} />
        </div>
      )}

      {/* DATA DISPLAY */}
      {isAnyData && (
        <div className="ct">

          {/* Session timeline */}
          <div className="sb">
            {sess.map(function (s, idx) {
              return (
                <div key={idx} className="si" style={{ opacity: s.status === "done" ? 0.3 : 1 }}>
                  <div className="sd" style={{ background: sessionColor(s.status) }} />
                  <div className="sn">{s.name}</div>
                  <div className="stm">{s.time}</div>
                  <div className="slb" style={{ color: sessionColor(s.status) }}>{s.label}</div>
                </div>
              );
            })}
          </div>

          {/* Verdict */}
          {data.verdict && (
            <div className={"vc fade " + (data.verdict.bias === "BULLISH" ? "bull" : data.verdict.bias === "BEARISH" ? "bear" : "neu")}>
              <div className="vh">
                <div className="vb" style={{ color: data.verdict.bias === "BULLISH" ? "#00e676" : data.verdict.bias === "BEARISH" ? "#ff5252" : "#ffa726" }}>
                  {data.verdict.bias === "BULLISH" ? "▲ " : data.verdict.bias === "BEARISH" ? "▼ " : "— "}
                  {data.verdict.bias}
                </div>
                <div className="vcf">{data.verdict.confidence}</div>
              </div>
              <p className="vs">{data.verdict.summary}</p>
              {data.verdict.levels && (
                <div className="vl">🎯 {data.verdict.levels}</div>
              )}
              {(data.verdict.bull_scenario || data.verdict.bear_scenario) && (
                <div className="scs">
                  <div className="scn">
                    <div className="sclab" style={{ color: "#00e676" }}>BULL</div>
                    <div className="sctxt">{data.verdict.bull_scenario || "—"}</div>
                  </div>
                  <div className="scn">
                    <div className="sclab" style={{ color: "#ff5252" }}>BEAR</div>
                    <div className="sctxt">{data.verdict.bear_scenario || "—"}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Flows */}
          {data.flows && (
            <div className="ib ibc fade">
              <div className="pl">💰 FLUX</div>
              <p className="ibt">{data.flows}</p>
            </div>
          )}

          {/* Correlations */}
          {data.correlations && (
            <div className="ib ibo fade">
              <div className="pl">🔗 CORRÉLATIONS</div>
              <p className="ibt">{data.correlations}</p>
            </div>
          )}

          {/* Movers */}
          {data.movers && data.movers.length > 0 && (
            <div>
              <div className="st"><span style={{ color: "#ffa726" }}>●</span> MARCHÉ</div>
              <div className="mg">
                {data.movers.map(function (m, idx) {
                  var isUp = m.dir === "up";
                  return (
                    <div key={idx} className="mc fade" style={{ animationDelay: idx * 30 + "ms" }}>
                      <div className="mt">
                        <span className="mn">{m.name}</span>
                        <span className="mp" style={{ color: isUp ? "#00e676" : "#ff5252" }}>{m.pct}</span>
                      </div>
                      <div className="mpx">{m.price}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* News */}
          {data.news && data.news.length > 0 && (
            <div>
              <div className="st"><span style={{ color: "#ff5252" }}>●</span> NEWS</div>
              <div className="nl">
                {data.news.map(function (n, idx) {
                  var impColor = n.i === "high" ? "#ff5252" : n.i === "medium" ? "#ffa726" : "#555";
                  var biasIcon = n.b === "bullish" ? "▲" : n.b === "bearish" ? "▼" : "—";
                  var biasColor = n.b === "bullish" ? "#00e676" : n.b === "bearish" ? "#ff5252" : "#78909c";
                  return (
                    <div key={idx} className="ni fade" style={{ borderLeftColor: impColor, animationDelay: idx * 25 + "ms" }}>
                      <div className="nh">
                        <span className="nit" style={{ color: impColor }}>{(n.i || "").toUpperCase()}</span>
                        <span className="ntt">{n.t}</span>
                        <span className="nb" style={{ color: biasColor }}>{biasIcon}</span>
                      </div>
                      <div className="ns">{n.s}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Events */}
          {data.events && data.events.length > 0 && (
            <div>
              <div className="st"><span style={{ color: "#f472b6" }}>●</span> CALENDRIER ÉCO</div>
              <div className="eg">
                {data.events.map(function (ev, idx) {
                  return (
                    <div key={idx} className="ec fade" style={{ animationDelay: idx * 30 + "ms" }}>
                      <div className="et">
                        <span className="en">{ev.n}</span>
                        <span className="ed">{ev.d}</span>
                      </div>
                      {ev.c && (
                        <div className="er">Consensus: <span className="erv">{ev.c}</span></div>
                      )}
                      {ev.above && <div className="ea eabu">📈 {ev.above}</div>}
                      {ev.below && <div className="ea eabe">📉 {ev.below}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FOOTER */}
      <footer className="ft">
        <span>FLOW BRIEFING · NQ SCALPER</span>
        <span>Haiku 4.5 · RSS · ~$0.005/scan</span>
      </footer>
    </div>
  );
}

/* ── STYLES ── */
var STYLES = [
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');",
  ":root{--m:'IBM Plex Mono',monospace}",
  "*{box-sizing:border-box;margin:0;padding:0}",
  "body{background:#07080c}",
  ".hdr{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid #1a1e2e;background:rgba(7,8,12,.95);backdrop-filter:blur(12px);position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:10px}",
  ".logo{display:flex;align-items:center;gap:12px}",
  ".lm{width:32px;height:32px;border-radius:6px;background:linear-gradient(135deg,rgba(0,212,255,.15),rgba(0,212,255,.05));border:1px solid rgba(0,212,255,.25);display:flex;align-items:center;justify-content:center;font-size:14px;color:#00d4ff}",
  ".lt{font-family:var(--m);font-size:13px;font-weight:600;color:#fff;letter-spacing:2px}",
  ".ls{font-size:10px;color:#3d4156}",
  ".acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".tb{font-family:var(--m);font-size:10px;color:#3d4156}",
  ".btn{font-family:var(--m);font-size:11px;padding:7px 16px;border-radius:5px;cursor:pointer;transition:all .15s;border:none}",
  ".bp{background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.25);color:#00d4ff}",
  ".bp:hover{background:rgba(0,212,255,.18)}.bp:disabled{opacity:.4;cursor:default}",
  ".bg{background:transparent;border:1px solid #1a1e2e;color:#6b7084;padding:7px 10px}",
  ".bd{background:rgba(88,101,242,.12);border:1px solid rgba(88,101,242,.3);color:#7289da}",
  ".prog{padding:10px 24px;font-family:var(--m);font-size:11px;color:#00d4ff;background:rgba(0,212,255,.03);border-bottom:1px solid #1a1e2e;display:flex;align-items:center;gap:8px}",
  "@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}",
  ".dot{animation:blink 1s infinite;font-size:8px}",
  ".empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:40px}",
  ".eh{font-family:var(--m);font-size:18px;color:#fff;letter-spacing:1.5px;margin-bottom:8px}",
  ".ep{font-size:13px;color:#3d4156;max-width:400px;line-height:1.6;margin-bottom:20px}",
  ".sp{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:24px}",
  ".sch{font-family:var(--m);font-size:10px;padding:4px 10px;border:1px solid;border-radius:4px;display:flex;gap:6px}",
  ".bs{font-family:var(--m);font-size:14px;font-weight:600;padding:14px 40px;border-radius:8px;cursor:pointer;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.04));border:1px solid rgba(0,212,255,.3);color:#00d4ff;letter-spacing:1px;transition:all .2s}",
  ".bs:hover{transform:scale(1.02);box-shadow:0 0 30px rgba(0,212,255,.15)}",
  ".err{margin:24px;padding:16px;background:rgba(255,82,82,.06);border:1px solid rgba(255,82,82,.15);border-radius:8px;color:#ff5252;font-size:12px;text-align:center}",
  "@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}",
  ".sk{background:linear-gradient(90deg,#0c0e14 25%,#12151e 50%,#0c0e14 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px}",
  ".ct{padding:16px 24px 40px;max-width:1200px;margin:0 auto}",
  ".sb{display:flex;gap:4px;margin-bottom:16px;overflow-x:auto}",
  ".si{flex:1;min-width:80px;background:#0c0e14;border:1px solid #1a1e2e;border-radius:6px;padding:6px 8px;text-align:center}",
  ".sd{width:6px;height:6px;border-radius:50%;margin:0 auto 3px}",
  ".sn{font-size:8px;color:#6b7084}",
  ".stm{font-family:var(--m);font-size:8px;color:#3d4156}",
  ".slb{font-family:var(--m);font-size:9px;font-weight:600;margin-top:1px}",
  ".vc{background:#0c0e14;border:1px solid #1a1e2e;border-radius:10px;padding:20px 24px;margin-bottom:16px;position:relative;overflow:hidden}",
  ".vc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}",
  ".vc.bull::before{background:linear-gradient(90deg,transparent,#00e676,transparent)}",
  ".vc.bear::before{background:linear-gradient(90deg,transparent,#ff5252,transparent)}",
  ".vc.neu::before{background:linear-gradient(90deg,transparent,#ffa726,transparent)}",
  ".vh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:10px}",
  ".vb{font-family:var(--m);font-size:20px;font-weight:700;letter-spacing:2px}",
  ".vcf{font-family:var(--m);font-size:10px;padding:3px 10px;border-radius:4px;font-weight:600;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#c4c8d4}",
  ".vs{font-size:13px;line-height:1.7;margin-bottom:14px}",
  ".vl{font-family:var(--m);font-size:11px;color:#00d4ff;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.1);border-radius:6px;padding:10px 14px;margin-bottom:14px}",
  ".scs{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".scn{background:rgba(255,255,255,.015);border:1px solid #1a1e2e;border-radius:8px;padding:12px}",
  ".sclab{font-family:var(--m);font-size:11px;font-weight:700;margin-bottom:6px}",
  ".sctxt{font-size:11px;color:#6b7084;line-height:1.4}",
  ".ib{background:#0c0e14;border:1px solid #1a1e2e;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:12px}",
  ".ibc{border-left:2px solid #00d4ff}",
  ".ibo{border-left:2px solid #ffa726}",
  ".ibt{font-size:11px;line-height:1.5;color:#6b7084}",
  ".pl{font-family:var(--m);font-size:9px;font-weight:600;color:#3d4156;letter-spacing:1.5px;margin-bottom:6px}",
  ".st{font-family:var(--m);font-size:10px;font-weight:600;color:#3d4156;letter-spacing:2px;margin:16px 0 10px;display:flex;align-items:center;gap:8px}",
  ".mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;margin-bottom:16px}",
  ".mc{background:#0c0e14;border:1px solid #1a1e2e;border-radius:6px;padding:10px 12px}",
  ".mt{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}",
  ".mn{font-family:var(--m);font-size:10px;font-weight:600;color:#fff}",
  ".mp{font-family:var(--m);font-size:11px;font-weight:700}",
  ".mpx{font-family:var(--m);font-size:16px;font-weight:700;color:#fff}",
  ".nl{display:flex;flex-direction:column;gap:3px;margin-bottom:16px}",
  ".ni{padding:10px 14px;background:#0c0e14;border-left:2px solid #1a1e2e;border-radius:0 6px 6px 0}",
  ".nh{display:flex;align-items:center;gap:8px;margin-bottom:4px}",
  ".nit{font-family:var(--m);font-size:8px;font-weight:700;flex-shrink:0}",
  ".ntt{font-size:12px;font-weight:500;color:#ddd;flex:1}",
  ".nb{font-family:var(--m);font-size:10px;font-weight:700}",
  ".ns{font-size:11px;color:#6b7084;line-height:1.4}",
  ".eg{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;margin-bottom:16px}",
  ".ec{background:#0c0e14;border:1px solid #1a1e2e;border-radius:8px;padding:12px}",
  ".et{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}",
  ".en{font-size:13px;font-weight:600;color:#ddd}",
  ".ed{font-family:var(--m);font-size:10px;color:#3d4156}",
  ".er{font-family:var(--m);font-size:10px;color:#6b7084;margin-bottom:4px}",
  ".erv{color:#c4c8d4}",
  ".ea{font-size:10px;padding:4px 8px;border-radius:4px;margin-bottom:3px;line-height:1.4}",
  ".eabu{background:rgba(0,230,118,.06);color:#00e676}",
  ".eabe{background:rgba(255,82,82,.06);color:#ff5252}",
  "@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
  ".fade{animation:fadeUp .25s ease both}",
  ".mo{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;display:flex;align-items:center;justify-content:center}",
  ".md{background:#0c0e14;border:1px solid #252a3a;border-radius:12px;padding:28px;width:400px;max-width:90vw}",
  ".mh{font-family:var(--m);font-size:13px;color:#fff;margin-bottom:16px}",
  ".ml{font-size:11px;color:#6b7084;display:block;margin-bottom:6px}",
  ".mi{width:100%;padding:8px 12px;background:#07080c;border:1px solid #1a1e2e;border-radius:6px;color:#c4c8d4;font-family:var(--m);font-size:11px;outline:none;margin-bottom:12px}",
  ".ma{display:flex;justify-content:flex-end;gap:8px}",
  ".ft{padding:14px 24px;border-top:1px solid #1a1e2e;display:flex;justify-content:space-between;font-family:var(--m);font-size:9px;color:#3d4156}",
  ".toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;font-family:var(--m);font-size:11px;z-index:200;animation:fadeUp .3s ease}",
  ".sending{background:rgba(88,101,242,.2);color:#7289da}",
  ".sent{background:rgba(0,230,118,.15);color:#00e676}",
  ".error{background:rgba(255,82,82,.12);color:#ff5252}",
  "@media(max-width:768px){.scs{grid-template-columns:1fr}.mg{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}.ct{padding:12px}.sb{flex-wrap:wrap}}",
  "::-webkit-scrollbar{width:3px}",
  "::-webkit-scrollbar-thumb{background:#1a1e2e;border-radius:2px}"
].join("\n");
