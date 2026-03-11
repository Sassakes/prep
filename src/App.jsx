import { useState, useEffect, useCallback, useRef } from "react";

const CATEGORIES = [
  { id: "nq_es", label: "NQ / ES", icon: "◆", color: "#00e5ff", desc: "Tech & Large Cap" },
  { id: "rty", label: "RTY", icon: "◇", color: "#ff6b35", desc: "Small Caps" },
  { id: "forex", label: "Forex", icon: "¤", color: "#a78bfa", desc: "Devises majeures" },
  { id: "commodities", label: "Commodities", icon: "●", color: "#fbbf24", desc: "Pétrole, Or, Gaz" },
  { id: "bonds", label: "Bonds", icon: "▬", color: "#34d399", desc: "Taux & Obligations" },
  { id: "calendar", label: "Calendrier Éco", icon: "◰", color: "#f472b6", desc: "Events à venir" },
];

const SYSTEM_PROMPT = `Tu es un analyste macro/flux pour un trader de volatilité sur NQ/ES. 
Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans texte avant/après.

Le JSON doit avoir cette structure exacte:
{
  "timestamp": "2024-01-15T08:30:00Z",
  "market_pulse": {
    "sentiment": "risk-on | risk-off | mixed",textBlocks.map
    "vix_context": "description courte du VIX et vol implicite",
    "flow_direction": "description des flux dominants (equity, bonds, commodities)",
    "key_theme": "le thème macro dominant du jour en 1 phrase"
  },
  "news": [
    {
      "id": "1",
      "title": "Titre court",
      "summary": "2-3 phrases résumant la news et son impact marché",
      "category": "nq_es | rty | forex | commodities | bonds | calendar",
      "impact": "high | medium | low",
      "bias": "bullish | bearish | neutral",
      "time": "il y a 2h / aujourd'hui 14:30 / demain",
      "source": "source",
      "instruments": ["NQ", "ES", "AAPL"]
    }
  ],
  "top_movers": [
    {
      "instrument": "NQ",
      "change_pct": "+1.2%",
      "context": "raison courte",
      "trend": "up | down"
    }
  ],
  "upcoming_events": [
    {
      "event": "FOMC Minutes",
      "date": "2024-01-17 20:00 CET",
      "impact": "high | medium | low",
      "affected": ["NQ", "ES", "DXY", "Bonds"],
      "expectation": "ce qu'attend le marché"
    }
  ]
}

Règles:
- Minimum 8-12 news couvrant toutes les catégories
- Inclus les événements éco de la semaine (NFP, CPI, FOMC, PMI, etc.)
- Focus sur ce qui drive la volatilité et les flux
- Mentionne les niveaux clés si pertinent
- Donne le contexte pour un scalper NQ qui joue la vol
- Top movers: inclus NQ, ES, RTY, DXY, pétrole, or, 10Y yield, VIX minimum`;

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [expandedNews, setExpandedNews] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const pulseRef = useRef(null);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString("fr-FR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [
            {
              role: "user",
              content: `Nous sommes le ${dateStr}. Donne-moi le morning briefing complet pour aujourd'hui. Cherche les dernières actualités économiques et financières, le calendrier éco de la semaine, les top movers, et tout ce qui peut impacter NQ, ES, RTY, Forex et commodities. Focus sur les flux monétaires et la volatilité.`,
            },
          ],
        }),
      });

      const result = await response.json();

      // Extraire le texte de tous les types de blocs
      let fullText = "";
      for (const block of result.content || []) {
        if (block.type === "text" && block.text) {
          fullText += block.text;
        }
      }

      if (!fullText) {
        console.log("API response:", JSON.stringify(result, null, 2));
      }

      const cleaned = fullText.replace(/```json|```/g, "").trim();

      let jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setData(parsed);
        setLastRefresh(new Date());
      } else {
        console.log("Raw text received:", fullText);
        throw new Error("No valid JSON in response");
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredNews = data?.news?.filter((n) => {
    const matchCat = activeFilter === "all" || n.category === activeFilter;
    const matchSearch =
      !searchQuery ||
      n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.instruments?.some((i) =>
        i.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchCat && matchSearch;
  });

  const toggleExpand = (id) => {
    setExpandedNews((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getCatColor = (catId) =>
    CATEGORIES.find((c) => c.id === catId)?.color || "#888";
  const getCatIcon = (catId) =>
    CATEGORIES.find((c) => c.id === catId)?.icon || "•";

  const impactColor = (impact) =>
    impact === "high" ? "#ff4444" : impact === "medium" ? "#ffa726" : "#666";
  const biasColor = (bias) =>
    bias === "bullish" ? "#00e676" : bias === "bearish" ? "#ff5252" : "#78909c";
  const biasLabel = (bias) =>
    bias === "bullish" ? "▲ BULL" : bias === "bearish" ? "▼ BEAR" : "— NEUTRE";

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        
        .shimmer-loading {
          background: linear-gradient(90deg, #1a1a2e 25%, #252547 50%, #1a1a2e 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 6px;
        }
        
        .news-card {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .news-card:hover {
          transform: translateX(4px);
          background: rgba(255,255,255,0.04) !important;
        }
        
        .filter-btn {
          transition: all 0.15s ease;
          cursor: pointer;
          user-select: none;
        }
        .filter-btn:hover {
          transform: translateY(-1px);
        }
        
        .refresh-btn {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .refresh-btn:hover {
          transform: scale(1.02);
          box-shadow: 0 0 20px rgba(0,229,255,0.3);
        }
        .refresh-btn:active {
          transform: scale(0.98);
        }
        
        .mover-card {
          transition: all 0.2s ease;
        }
        .mover-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>

      {/* Scanline overlay */}
      <div style={styles.scanline} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoRow}>
            <div style={styles.logoIcon}>
              <span style={{ fontSize: 18, color: "#00e5ff" }}>⚡</span>
            </div>
            <div>
              <h1 style={styles.title}>FLOW BRIEFING</h1>
              <p style={styles.subtitle}>Morning Macro · Volatility · Flux</p>
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          {lastRefresh && (
            <span style={styles.lastUpdate}>
              MàJ {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            className="refresh-btn"
            onClick={fetchBriefing}
            disabled={loading}
            style={{
              ...styles.refreshBtn,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ animation: "glow 1s infinite" }}>◌</span> Analyse en cours...
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                ↻ Refresh Briefing
              </span>
            )}
          </button>
        </div>
      </header>

      {/* No data state */}
      {!data && !loading && !error && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>⚡</div>
          <h2 style={styles.emptyTitle}>Morning Briefing</h2>
          <p style={styles.emptyDesc}>
            Lance le scan pour récupérer les dernières news, le calendrier éco,
            les top movers et l'analyse des flux.
          </p>
          <button
            className="refresh-btn"
            onClick={fetchBriefing}
            style={styles.startBtn}
          >
            Scanner les marchés
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={styles.skeleton}>
          <div className="shimmer-loading" style={{ height: 80, width: "100%", marginBottom: 16 }} />
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="shimmer-loading" style={{ height: 90, flex: 1 }} />
            ))}
          </div>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="shimmer-loading" style={{ height: 64, width: "100%", marginBottom: 8 }} />
          ))}
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <span style={{ color: "#ff5252", fontSize: 14 }}>⚠ {error}</span>
          <button onClick={fetchBriefing} style={styles.retryBtn}>Réessayer</button>
        </div>
      )}

      {data && (
        <div style={styles.content}>
          {/* Market Pulse */}
          <div ref={pulseRef} style={styles.pulseSection}>
            <div style={styles.pulseGrid}>
              <div style={styles.pulseCard}>
                <div style={styles.pulseLabel}>SENTIMENT</div>
                <div style={{
                  ...styles.pulseValue,
                  color: data.market_pulse?.sentiment === "risk-on" ? "#00e676" :
                         data.market_pulse?.sentiment === "risk-off" ? "#ff5252" : "#ffa726"
                }}>
                  {data.market_pulse?.sentiment?.toUpperCase() || "—"}
                </div>
              </div>
              <div style={styles.pulseCard}>
                <div style={styles.pulseLabel}>VIX / VOL</div>
                <div style={styles.pulseText}>{data.market_pulse?.vix_context || "—"}</div>
              </div>
              <div style={styles.pulseCard}>
                <div style={styles.pulseLabel}>FLUX DOMINANTS</div>
                <div style={styles.pulseText}>{data.market_pulse?.flow_direction || "—"}</div>
              </div>
              <div style={{ ...styles.pulseCard, gridColumn: "1 / -1", borderLeft: "2px solid #00e5ff" }}>
                <div style={styles.pulseLabel}>THÈME DU JOUR</div>
                <div style={{ ...styles.pulseText, fontSize: 14, color: "#e0e0e0" }}>
                  {data.market_pulse?.key_theme || "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Top Movers */}
          {data.top_movers?.length > 0 && (
            <div style={styles.moversSection}>
              <h3 style={styles.sectionTitle}>
                <span style={{ color: "#fbbf24" }}>●</span> TOP MOVERS
              </h3>
              <div style={styles.moversGrid}>
                {data.top_movers.map((m, i) => (
                  <div
                    key={i}
                    className="mover-card"
                    style={{
                      ...styles.moverCard,
                      animationDelay: `${i * 0.05}s`,
                    }}
                  >
                    <div style={styles.moverTop}>
                      <span style={styles.moverName}>{m.instrument}</span>
                      <span style={{
                        ...styles.moverChange,
                        color: m.trend === "up" ? "#00e676" : "#ff5252"
                      }}>
                        {m.change_pct}
                      </span>
                    </div>
                    <div style={styles.moverContext}>{m.context}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters + Search */}
          <div style={styles.filterBar}>
            <div style={styles.filterRow}>
              <button
                className="filter-btn"
                onClick={() => setActiveFilter("all")}
                style={{
                  ...styles.filterBtn,
                  background: activeFilter === "all" ? "rgba(0,229,255,0.15)" : "transparent",
                  borderColor: activeFilter === "all" ? "#00e5ff" : "#333",
                  color: activeFilter === "all" ? "#00e5ff" : "#888",
                }}
              >
                ALL
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  className="filter-btn"
                  onClick={() => setActiveFilter(cat.id)}
                  style={{
                    ...styles.filterBtn,
                    background: activeFilter === cat.id ? `${cat.color}15` : "transparent",
                    borderColor: activeFilter === cat.id ? cat.color : "#333",
                    color: activeFilter === cat.id ? cat.color : "#888",
                  }}
                >
                  <span style={{ marginRight: 4 }}>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Rechercher... (NQ, CPI, pétrole...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {/* News Feed */}
          <div style={styles.newsFeed}>
            {filteredNews?.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#555" }}>
                Aucune news pour ce filtre
              </div>
            )}
            {filteredNews?.map((news, i) => (
              <div
                key={news.id || i}
                className="news-card"
                onClick={() => toggleExpand(news.id || i)}
                style={{
                  ...styles.newsCard,
                  animation: `fadeSlideUp 0.3s ease ${i * 0.04}s both`,
                  borderLeftColor: getCatColor(news.category),
                }}
              >
                <div style={styles.newsHeader}>
                  <div style={styles.newsLeft}>
                    <span style={{ color: getCatColor(news.category), marginRight: 8, fontSize: 12 }}>
                      {getCatIcon(news.category)}
                    </span>
                    <span style={{
                      ...styles.impactBadge,
                      background: `${impactColor(news.impact)}20`,
                      color: impactColor(news.impact),
                      border: `1px solid ${impactColor(news.impact)}40`,
                    }}>
                      {news.impact?.toUpperCase()}
                    </span>
                    <h4 style={styles.newsTitle}>{news.title}</h4>
                  </div>
                  <div style={styles.newsRight}>
                    <span style={{
                      ...styles.biasBadge,
                      color: biasColor(news.bias),
                    }}>
                      {biasLabel(news.bias)}
                    </span>
                    <span style={styles.newsTime}>{news.time}</span>
                  </div>
                </div>

                {expandedNews.has(news.id || i) && (
                  <div style={styles.newsBody}>
                    <p style={styles.newsSummary}>{news.summary}</p>
                    <div style={styles.newsFooter}>
                      {news.instruments?.map((inst) => (
                        <span key={inst} style={styles.instrumentTag}>{inst}</span>
                      ))}
                      {news.source && (
                        <span style={styles.newsSource}>{news.source}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Upcoming Events */}
          {data.upcoming_events?.length > 0 && (
            <div style={styles.eventsSection}>
              <h3 style={styles.sectionTitle}>
                <span style={{ color: "#f472b6" }}>◰</span> CALENDRIER ÉCO — SEMAINE
              </h3>
              <div style={styles.eventsGrid}>
                {data.upcoming_events.map((evt, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.eventCard,
                      animation: `fadeSlideUp 0.3s ease ${i * 0.05}s both`,
                    }}
                  >
                    <div style={styles.eventTop}>
                      <div style={{
                        ...styles.eventImpact,
                        background: `${impactColor(evt.impact)}20`,
                        color: impactColor(evt.impact),
                        border: `1px solid ${impactColor(evt.impact)}40`,
                      }}>
                        {evt.impact?.toUpperCase()}
                      </div>
                      <span style={styles.eventDate}>{evt.date}</span>
                    </div>
                    <h4 style={styles.eventName}>{evt.event}</h4>
                    {evt.expectation && (
                      <p style={styles.eventExpect}>{evt.expectation}</p>
                    )}
                    <div style={styles.eventAffected}>
                      {evt.affected?.map((a) => (
                        <span key={a} style={styles.instrumentTag}>{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <footer style={styles.footer}>
        <span>FLOW BRIEFING · NQ Scalper Dashboard</span>
        <span style={{ color: "#444" }}>Powered by Claude + Web Search</span>
      </footer>
    </div>
  );
}

const styles = {
  root: {
    fontFamily: "'Outfit', sans-serif",
    background: "linear-gradient(180deg, #0a0a1a 0%, #0d0d24 50%, #0a0a1a 100%)",
    color: "#c8c8d0",
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
  },
  scanline: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: "2px",
    background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.08), transparent)",
    animation: "scanline 8s linear infinite",
    pointerEvents: "none",
    zIndex: 100,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 28px",
    borderBottom: "1px solid #1a1a2e",
    backdropFilter: "blur(10px)",
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "rgba(10,10,26,0.9)",
    flexWrap: "wrap",
    gap: 12,
  },
  headerLeft: { display: "flex", alignItems: "center" },
  headerRight: { display: "flex", alignItems: "center", gap: 16 },
  logoRow: { display: "flex", alignItems: "center", gap: 12 },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "rgba(0,229,255,0.1)",
    border: "1px solid rgba(0,229,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: "2px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  subtitle: {
    fontSize: 11,
    color: "#555",
    letterSpacing: "0.5px",
    marginTop: 1,
  },
  lastUpdate: {
    fontSize: 11,
    color: "#555",
    fontFamily: "'JetBrains Mono', monospace",
  },
  refreshBtn: {
    padding: "8px 20px",
    background: "rgba(0,229,255,0.08)",
    border: "1px solid rgba(0,229,255,0.25)",
    color: "#00e5ff",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: "0.5px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    padding: 40,
    textAlign: "center",
  },
  emptyIcon: { fontSize: 48, marginBottom: 20, opacity: 0.3 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 12,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "1px",
  },
  emptyDesc: {
    fontSize: 14,
    color: "#666",
    maxWidth: 440,
    lineHeight: 1.6,
    marginBottom: 28,
  },
  startBtn: {
    padding: "14px 36px",
    background: "linear-gradient(135deg, rgba(0,229,255,0.15), rgba(0,229,255,0.05))",
    border: "1px solid rgba(0,229,255,0.3)",
    color: "#00e5ff",
    borderRadius: 8,
    fontSize: 15,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "1px",
  },
  skeleton: { padding: 28 },
  errorBox: {
    margin: 28,
    padding: 16,
    background: "rgba(255,82,82,0.08)",
    border: "1px solid rgba(255,82,82,0.2)",
    borderRadius: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  retryBtn: {
    padding: "6px 16px",
    background: "transparent",
    border: "1px solid #ff5252",
    color: "#ff5252",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
  content: { padding: "0 28px 28px" },

  // Pulse
  pulseSection: { marginTop: 20, marginBottom: 24 },
  pulseGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
  },
  pulseCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #1a1a2e",
    borderRadius: 8,
    padding: "14px 16px",
  },
  pulseLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#555",
    letterSpacing: "1.5px",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 6,
  },
  pulseValue: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "1px",
  },
  pulseText: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "#999",
  },

  // Movers
  moversSection: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#888",
    letterSpacing: "2px",
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  moversGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 8,
  },
  moverCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #1a1a2e",
    borderRadius: 8,
    padding: "12px 14px",
    animation: "fadeSlideUp 0.3s ease both",
  },
  moverTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  moverName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    fontFamily: "'JetBrains Mono', monospace",
  },
  moverChange: {
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  moverContext: {
    fontSize: 11,
    color: "#666",
    lineHeight: 1.4,
  },

  // Filters
  filterBar: {
    marginBottom: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  filterRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  filterBtn: {
    padding: "6px 12px",
    border: "1px solid #333",
    borderRadius: 6,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    letterSpacing: "0.5px",
    background: "transparent",
  },
  searchInput: {
    padding: "8px 14px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #1a1a2e",
    borderRadius: 6,
    color: "#c8c8d0",
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    width: 240,
  },

  // News
  newsFeed: { display: "flex", flexDirection: "column", gap: 4 },
  newsCard: {
    padding: "12px 16px",
    background: "rgba(255,255,255,0.015)",
    borderLeft: "3px solid #333",
    borderRadius: "0 6px 6px 0",
  },
  newsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  newsLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  newsRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  impactBadge: {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.5px",
    flexShrink: 0,
  },
  newsTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: "#e0e0e0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  biasBadge: {
    fontSize: 10,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.5px",
  },
  newsTime: {
    fontSize: 10,
    color: "#444",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  },
  newsBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid rgba(255,255,255,0.04)",
  },
  newsSummary: {
    fontSize: 12,
    lineHeight: 1.6,
    color: "#999",
    marginBottom: 10,
  },
  newsFooter: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  instrumentTag: {
    padding: "2px 8px",
    background: "rgba(0,229,255,0.06)",
    border: "1px solid rgba(0,229,255,0.12)",
    borderRadius: 4,
    fontSize: 10,
    color: "#00e5ff",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
  },
  newsSource: {
    fontSize: 10,
    color: "#444",
    fontStyle: "italic",
    marginLeft: "auto",
  },

  // Events
  eventsSection: { marginTop: 28 },
  eventsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 10,
  },
  eventCard: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid #1a1a2e",
    borderRadius: 8,
    padding: "14px 16px",
  },
  eventTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eventImpact: {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "0.5px",
  },
  eventDate: {
    fontSize: 11,
    color: "#666",
    fontFamily: "'JetBrains Mono', monospace",
  },
  eventName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#e0e0e0",
    marginBottom: 6,
  },
  eventExpect: {
    fontSize: 11,
    color: "#777",
    lineHeight: 1.5,
    marginBottom: 8,
  },
  eventAffected: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
  },

  footer: {
    padding: "16px 28px",
    borderTop: "1px solid #1a1a2e",
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "#333",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: "1px",
  },
};
