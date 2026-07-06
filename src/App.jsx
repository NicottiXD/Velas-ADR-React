import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, RefreshCw, ArrowUp, ArrowDown, X, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

// ============================================================= //
// TICKERS A CONSULTAR
// Antes esto era un array de objetos hardcodeado (RAW_DATA).
// Ahora solo guardamos la lista de tickers y el resto de los
// datos (open/high/low/close/prevClose) se pide en vivo a la
// API de Yahoo Finance (endpoint "chart").
// ============================================================= //
const TICKERS = [
  "GGAL", "BMA", "YPF", "MELI", "SUPV", "CEPU", "PAM",
  "TGS", "CRESY", "BIOX", "EDN", "IRS", "LOMA", "TEO",
];

// Yahoo Finance no manda headers CORS para pegarle directo desde
// el navegador, así que hace falta un proxy. Este es uno público
// de ejemplo (corsproxy.io) — para producción armá tu propio
// proxy chiquito (Flask/Node/Cloudflare Worker) que reenvíe la
// request a query1.finance.yahoo.com, así no dependés de un
// servicio de terceros y evitás rate limits ajenos.
const CORS_PROXY = "https://corsproxy.io/?url=";
// interval=5m + range=1d trae varios puntos intradía reales, en vez
// de un solo candle diario (que es lo que generaba open == close
// cuando el meta no traía regularMarketOpen).
const YAHOO_CHART_URL = (ticker) =>
  `${CORS_PROXY}${encodeURIComponent(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=5m&range=1d`
  )}`;

const MAX_PCT_COLOR = 15; // variación % a la que el color llega a su máxima intensidad
const REFRESH_SECONDS = 300; // 5 minutos

function pct(value, prev) {
  return ((value - prev) / prev) * 100;
}

function deriveCandle(row) {
  const closePct = pct(row.close, row.prevClose);
  return {
    ...row,
    openPct: pct(row.open, row.prevClose),
    highPct: pct(row.high, row.prevClose),
    lowPct: pct(row.low, row.prevClose),
    closePct,
  };
}

// Extrae open/high/low/close/prevClose de la respuesta cruda de
// Yahoo Finance (chart endpoint) para un ticker puntual.
//
// Prioridad de las fuentes:
// 1) Los campos que YA vienen calculados por Yahoo en "meta"
//    (regularMarketOpen, regularMarketDayHigh, regularMarketDayLow,
//    regularMarketPrice, chartPreviousClose) — estos los arma Yahoo
//    con datos de tick completo del día, son más precisos que lo que
//    podamos reconstruir nosotros con barras de 5 minutos.
// 2) Si algún campo del meta viene null/ausente (pasa con algunos
//    tickers), recién ahí se reconstruye a mano a partir de la serie
//    intradía (indicators.quote), filtrando solo las barras dentro
//    de meta.currentTradingPeriod.regular para no arrastrar cotizaciones
//    erráticas de pre-market/after-hours (típico en ADRs poco líquidos).
function parseYahooChart(ticker, json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Sin datos para ${ticker}`);

  const meta = result.meta;

  // Fallback: reconstruir desde las barras intradía, solo sesión regular.
  const buildFromIntraday = () => {
    const quote = result.indicators?.quote?.[0] ?? {};
    const timestamps = result.timestamp ?? [];
    const regular = meta.currentTradingPeriod?.regular;
    const inRegularSession = (ts) => !regular || (ts >= regular.start && ts <= regular.end);

    const opens = [];
    const highs = [];
    const lows = [];
    const closes = [];
    timestamps.forEach((ts, i) => {
      if (!inRegularSession(ts)) return;
      if (quote.open?.[i] != null) opens.push(quote.open[i]);
      if (quote.high?.[i] != null) highs.push(quote.high[i]);
      if (quote.low?.[i] != null) lows.push(quote.low[i]);
      if (quote.close?.[i] != null) closes.push(quote.close[i]);
    });
    return {
      open: opens[0],
      high: highs.length ? Math.max(...highs) : undefined,
      low: lows.length ? Math.min(...lows) : undefined,
      close: closes[closes.length - 1],
    };
  };

  let fallback = null;
  const getFallback = () => (fallback ??= buildFromIntraday());

  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const open = meta.regularMarketOpen ?? getFallback().open;
  const high = meta.regularMarketDayHigh ?? getFallback().high;
  const low = meta.regularMarketDayLow ?? getFallback().low;
  const close = meta.regularMarketPrice ?? getFallback().close;

  if ([prevClose, open, high, low, close].some((v) => v == null)) {
    throw new Error(`Datos incompletos para ${ticker}`);
  }

  return { ticker, open, high, low, close, prevClose };
}

async function fetchTicker(ticker) {
  const res = await fetch(YAHOO_CHART_URL(ticker));
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${ticker}`);
  const json = await res.json();
  return parseYahooChart(ticker, json);
}

async function fetchAllTickers(tickers) {
  const settled = await Promise.allSettled(tickers.map(fetchTicker));
  const rows = [];
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") rows.push(r.value);
    else failed.push(tickers[i]);
  });
  return { rows, failed };
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolateColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = lerp(a[0], b[0], t);
  const g = lerp(a[1], b[1], t);
  const bl = lerp(a[2], b[2], t);
  return `rgb(${r},${g},${bl})`;
}

function getCandleColor(closePct) {
  if (closePct == null || Number.isNaN(closePct)) return "#566178";
  const intensity = Math.min(Math.abs(closePct) / MAX_PCT_COLOR, 1);
  if (closePct > 0) return interpolateColor("#123527", "#3CE6A0", intensity);
  if (closePct < 0) return interpolateColor("#3B1620", "#FF5A6E", intensity);
  return "#566178";
}

function fmtPct(v) {
  const s = v.toFixed(2);
  return (v > 0 ? "+" : "") + s + "%";
}

function fmtPrice(v) {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VelasADR() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedTickers, setFailedTickers] = useState([]);

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("variacion");
  const [selected, setSelected] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_SECONDS);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [flash, setFlash] = useState(false);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows, failed } = await fetchAllTickers(TICKERS);
      if (rows.length === 0) {
        throw new Error("No se pudo obtener ningún ticker desde Yahoo Finance.");
      }
      setRawData(rows);
      setFailedTickers(failed);
      setLastUpdate(new Date());
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    } catch (e) {
      setError(e.message || "Error al consultar Yahoo Finance");
    } finally {
      setLoading(false);
      setSecondsLeft(REFRESH_SECONDS);
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresco automático cada REFRESH_SECONDS
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          loadData();
          return REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [loadData]);

  const candles = useMemo(() => rawData.map(deriveCandle), [rawData]);

  const filtered = useMemo(() => {
    let list = candles.filter((c) => c.ticker.toLowerCase().includes(query.toLowerCase()));
    if (sortBy === "variacion") list = [...list].sort((a, b) => b.closePct - a.closePct);
    else if (sortBy === "alfabetico") list = [...list].sort((a, b) => a.ticker.localeCompare(b.ticker));
    return list;
  }, [candles, query, sortBy]);

  const maxAbs = useMemo(() => {
    if (candles.length === 0) return 5;
    const vals = candles.flatMap((c) => [Math.abs(c.highPct), Math.abs(c.lowPct)]);
    return Math.max(...vals, 5) * 1.15;
  }, [candles]);

  const topGainer = useMemo(
    () => (candles.length ? [...candles].sort((a, b) => b.closePct - a.closePct)[0] : null),
    [candles]
  );
  const topLoser = useMemo(
    () => (candles.length ? [...candles].sort((a, b) => a.closePct - b.closePct)[0] : null),
    [candles]
  );

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const chartHeight = 340;
  const midY = chartHeight / 2;
  const pxPerPct = (chartHeight / 2 - 24) / maxAbs;
  const slotWidth = 62;
  const bodyWidth = 30;
  const chartWidth = Math.max(filtered.length * slotWidth, 320);

  const yFor = (v) => midY - v * pxPerPct;

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes flashRing { 0% { box-shadow: 0 0 0 0 rgba(210,168,87,0.55); } 100% { box-shadow: 0 0 0 10px rgba(210,168,87,0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .live-dot { animation: pulseDot 1.8s ease-in-out infinite; }
        .flash-ring { animation: flashRing 0.9s ease-out; }
        .spin-icon { animation: spin 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .live-dot { animation: none; }
          .flash-ring { animation: none; }
          .spin-icon { animation: none; }
        }
        input::placeholder { color: #5A6684; }
        ::-webkit-scrollbar { height: 8px; }
        ::-webkit-scrollbar-thumb { background: #22304A; border-radius: 8px; }
      `}</style>

      {/* ---- Barra superior ---- */}
      <div style={styles.topBar}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>MJP</span>
          <span style={styles.brandRest}>MARKETS</span>
        </div>
        <div style={styles.topBarRight}>
          <span
            style={{ ...styles.liveDot, backgroundColor: error ? "#FF5A6E" : "#3CE6A0" }}
            className={loading ? "" : "live-dot"}
          />
          <span style={styles.topBarText}>
            {loading
              ? "Actualizando…"
              : lastUpdate
              ? `Actualizado ${lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Sin datos"}
          </span>
          <span style={styles.topBarDivider} />
          <button onClick={loadData} style={styles.refreshBtn} title="Actualizar ahora">
            <RefreshCw size={13} color="#7E8CAA" className={loading ? "spin-icon" : ""} />
          </button>
          <span style={styles.topBarText}>Próxima en {mm}:{ss}</span>
        </div>
      </div>

      {/* ---- Encabezado ---- */}
      <div style={styles.header}>
        <h1 style={styles.title}>Horizonte diario</h1>
        <p style={styles.subtitle}>ADRs Argentina — variación vs. cierre anterior (%) · datos de Yahoo Finance</p>
      </div>

      {/* ---- Error general ---- */}
      {error && (
        <div style={styles.errorBanner}>
          No se pudo actualizar: {error}. Reintentando en la próxima ventana o tocá el ícono de refresh.
        </div>
      )}
      {!error && failedTickers.length > 0 && (
        <div style={styles.warningBanner}>
          No se pudieron traer: {failedTickers.join(", ")}
        </div>
      )}

      {/* ---- Loading inicial ---- */}
      {loading && candles.length === 0 && (
        <div style={styles.loadingBox}>
          <Loader2 size={18} className="spin-icon" color="#D2A857" />
          <span>Consultando Yahoo Finance…</span>
        </div>
      )}

      {candles.length > 0 && (
        <>
          {/* ---- Callouts subida / bajada ---- */}
          <div style={styles.calloutRow}>
            {topGainer && (
              <div style={{ ...styles.callout, borderColor: "#1F5A42" }}>
                <TrendingUp size={16} color="#3CE6A0" />
                <div>
                  <div style={styles.calloutLabel}>Mayor suba</div>
                  <div style={styles.calloutValue}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{topGainer.ticker}</span>
                    <span style={{ color: "#3CE6A0", marginLeft: 8 }}>{fmtPct(topGainer.closePct)}</span>
                  </div>
                </div>
              </div>
            )}
            {topLoser && (
              <div style={{ ...styles.callout, borderColor: "#6E2430" }}>
                <TrendingDown size={16} color="#FF5A6E" />
                <div>
                  <div style={styles.calloutLabel}>Mayor baja</div>
                  <div style={styles.calloutValue}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{topLoser.ticker}</span>
                    <span style={{ color: "#FF5A6E", marginLeft: 8 }}>{fmtPct(topLoser.closePct)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ---- Controles: buscar + ordenar ---- */}
          <div style={styles.controls}>
            <div style={styles.searchBox}>
              <Search size={15} color="#5A6684" />
              <input
                type="text"
                placeholder="Consultar ticker (ej: GGAL)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={styles.searchInput}
              />
              {query && (
                <X size={14} color="#5A6684" style={{ cursor: "pointer" }} onClick={() => setQuery("")} />
              )}
            </div>
            <div style={styles.sortGroup}>
              {[
                { key: "variacion", label: "Variación" },
                { key: "alfabetico", label: "A-Z" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  style={{
                    ...styles.sortBtn,
                    ...(sortBy === opt.key ? styles.sortBtnActive : {}),
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---- Gráfico "skyline" de velas ---- */}
          <div className={flash ? "flash-ring" : ""} style={styles.chartCard}>
            <div style={styles.chartScroll}>
              <svg width={chartWidth} height={chartHeight + 40} style={{ display: "block" }}>
                <line
                  x1={0} x2={chartWidth} y1={midY} y2={midY}
                  stroke="#D2A857" strokeWidth="1" strokeDasharray="2 4" opacity="0.55"
                />
                <text x={4} y={midY - 6} fill="#7E8CAA" fontSize="10" fontFamily="'JetBrains Mono', monospace">0%</text>

                {filtered.map((c, i) => {
                  const cx = i * slotWidth + slotWidth / 2;
                  const color = getCandleColor(c.closePct);
                  const isSelected = selected === c.ticker;
                  const bodyTop = yFor(Math.max(c.openPct, c.closePct));
                  const bodyBottomY = yFor(Math.min(c.openPct, c.closePct));
                  let bodyHeight = bodyBottomY - bodyTop;
                  if (bodyHeight < 2) bodyHeight = 2;

                  return (
                    <g
                      key={c.ticker}
                      onClick={() => setSelected(isSelected ? null : c.ticker)}
                      style={{ cursor: "pointer" }}
                      transform={isSelected ? `translate(0,-4)` : undefined}
                    >
                      <line
                        x1={cx} x2={cx} y1={yFor(c.highPct)} y2={yFor(c.lowPct)}
                        stroke={color} strokeWidth={isSelected ? 2.4 : 1.6}
                      />
                      <rect
                        x={cx - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight}
                        fill={color}
                        stroke={isSelected ? "#D2A857" : "rgba(0,0,0,0.35)"}
                        strokeWidth={isSelected ? 1.5 : 1}
                        rx="2"
                      />
                      <text
                        x={cx} y={chartHeight + 20} textAnchor="middle"
                        fill={isSelected ? "#EAF0FA" : "#7E8CAA"}
                        fontSize="11" fontFamily="'JetBrains Mono', monospace"
                        fontWeight={isSelected ? "700" : "400"}
                      >
                        {c.ticker}
                      </text>
                      <text
                        x={cx} y={chartHeight + 33} textAnchor="middle"
                        fill={color} fontSize="10" fontFamily="'JetBrains Mono', monospace"
                      >
                        {fmtPct(c.closePct)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            {filtered.length === 0 && (
              <div style={styles.emptyState}>Ningún ticker coincide con "{query}"</div>
            )}
          </div>

          {/* ---- Panel de detalle ---- */}
          {selected && (() => {
            const c = candles.find((x) => x.ticker === selected);
            if (!c) return null;
            const color = getCandleColor(c.closePct);
            return (
              <div style={styles.detailPanel}>
                <div style={styles.detailHeader}>
                  <div style={styles.detailTicker}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
                    {c.ticker}
                  </div>
                  <X size={16} color="#7E8CAA" style={{ cursor: "pointer" }} onClick={() => setSelected(null)} />
                </div>
                <div style={styles.detailGrid}>
                  <DetailField label="Apertura" value={fmtPrice(c.open)} sub={fmtPct(c.openPct)} />
                  <DetailField label="Máximo" value={fmtPrice(c.high)} sub={fmtPct(c.highPct)} />
                  <DetailField label="Mínimo" value={fmtPrice(c.low)} sub={fmtPct(c.lowPct)} />
                  <DetailField label="Cierre" value={fmtPrice(c.close)} sub={fmtPct(c.closePct)} highlight />
                </div>
                <div style={styles.detailFooter}>Cierre anterior: {fmtPrice(c.prevClose)} USD</div>
              </div>
            );
          })()}

          {/* ---- Ranking ---- */}
          <div style={styles.rankSection}>
            <div style={styles.rankTitle}>Ranking del día</div>
            <div style={styles.rankList}>
              {[...candles].sort((a, b) => b.closePct - a.closePct).map((c) => {
                const color = getCandleColor(c.closePct);
                const up = c.closePct >= 0;
                return (
                  <div
                    key={c.ticker}
                    style={{
                      ...styles.rankRow,
                      ...(selected === c.ticker ? styles.rankRowActive : {}),
                    }}
                    onClick={() => setSelected(selected === c.ticker ? null : c.ticker)}
                  >
                    <span style={styles.rankTicker}>{c.ticker}</span>
                    <span style={{ flex: 1 }} />
                    {up ? <ArrowUp size={13} color={color} /> : <ArrowDown size={13} color={color} />}
                    <span style={{ ...styles.rankPct, color }}>{fmtPct(c.closePct)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div style={styles.watermark}>@MJPmarkets</div>
    </div>
  );
}

function DetailField({ label, value, sub, highlight }) {
  return (
    <div>
      <div style={styles.detailLabel}>{label}</div>
      <div style={{ ...styles.detailValue, ...(highlight ? { color: "#EAF0FA" } : {}) }}>{value}</div>
      <div style={styles.detailSub}>{sub}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0B1220",
    color: "#EAF0FA",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "20px 24px 48px",
    boxSizing: "border-box",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 14,
    borderBottom: "1px solid #1A2740",
  },
  brand: { display: "flex", alignItems: "baseline", gap: 6, fontFamily: "'Space Grotesk', sans-serif" },
  brandMark: { color: "#D2A857", fontWeight: 700, fontSize: 15, letterSpacing: 1 },
  brandRest: { color: "#7E8CAA", fontWeight: 500, fontSize: 12, letterSpacing: 2 },
  topBarRight: { display: "flex", alignItems: "center", gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
  topBarText: { fontSize: 12, color: "#7E8CAA", fontFamily: "'JetBrains Mono', monospace" },
  topBarDivider: { width: 1, height: 12, background: "#22304A", margin: "0 2px" },
  refreshBtn: {
    background: "transparent", border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", padding: 2,
  },
  header: { marginTop: 24, marginBottom: 4 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  subtitle: { color: "#7E8CAA", fontSize: 13, marginTop: 4 },
  errorBanner: {
    marginTop: 16, background: "#3B1620", border: "1px solid #6E2430",
    color: "#FF9AA8", fontSize: 12.5, borderRadius: 8, padding: "10px 14px",
  },
  warningBanner: {
    marginTop: 16, background: "#241C0E", border: "1px solid #6E5424",
    color: "#E8C77F", fontSize: 12.5, borderRadius: 8, padding: "10px 14px",
  },
  loadingBox: {
    marginTop: 24, display: "flex", alignItems: "center", gap: 10,
    color: "#7E8CAA", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
  },
  calloutRow: { display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" },
  callout: {
    flex: "1 1 200px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#121B2E",
    border: "1px solid",
    borderRadius: 10,
    padding: "10px 14px",
  },
  calloutLabel: { fontSize: 11, color: "#7E8CAA", marginBottom: 2 },
  calloutValue: { fontSize: 16, fontFamily: "'JetBrains Mono', monospace" },
  controls: { display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap", alignItems: "center" },
  searchBox: {
    display: "flex", alignItems: "center", gap: 8,
    background: "#121B2E", border: "1px solid #22304A", borderRadius: 8,
    padding: "8px 12px", flex: "1 1 220px", maxWidth: 320,
  },
  searchInput: {
    background: "transparent", border: "none", outline: "none",
    color: "#EAF0FA", fontSize: 13, width: "100%", fontFamily: "'JetBrains Mono', monospace",
  },
  sortGroup: { display: "flex", gap: 6 },
  sortBtn: {
    background: "#121B2E", border: "1px solid #22304A", borderRadius: 8,
    color: "#7E8CAA", fontSize: 12, padding: "8px 14px", cursor: "pointer",
  },
  sortBtnActive: { background: "#1A2740", color: "#EAF0FA", borderColor: "#D2A857" },
  chartCard: {
    marginTop: 20, background: "#0F1626", border: "1px solid #1A2740",
    borderRadius: 12, padding: "20px 20px 8px", position: "relative",
  },
  chartScroll: { overflowX: "auto" },
  emptyState: { textAlign: "center", color: "#5A6684", fontSize: 13, padding: "24px 0" },
  detailPanel: {
    marginTop: 16, background: "#121B2E", border: "1px solid #D2A857",
    borderRadius: 12, padding: 16,
  },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  detailTicker: {
    display: "flex", alignItems: "center", gap: 8,
    fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700,
  },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px,1fr))", gap: 12 },
  detailLabel: { fontSize: 11, color: "#7E8CAA" },
  detailValue: { fontSize: 15, fontFamily: "'JetBrains Mono', monospace", color: "#C6CEE0", marginTop: 2 },
  detailSub: { fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#5A6684", marginTop: 2 },
  detailFooter: { marginTop: 12, fontSize: 11, color: "#5A6684", borderTop: "1px solid #22304A", paddingTop: 10 },
  rankSection: { marginTop: 28 },
  rankTitle: { fontSize: 13, color: "#7E8CAA", marginBottom: 10, letterSpacing: 0.5 },
  rankList: { display: "flex", flexDirection: "column", gap: 1, border: "1px solid #1A2740", borderRadius: 10, overflow: "hidden" },
  rankRow: {
    display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
    background: "#121B2E", cursor: "pointer", borderBottom: "1px solid #1A2740",
  },
  rankRowActive: { background: "#1A2740" },
  rankTicker: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, width: 60 },
  rankPct: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, width: 70, textAlign: "right" },
  watermark: { textAlign: "right", color: "#3A4560", fontSize: 12, marginTop: 24, fontFamily: "'Space Grotesk', sans-serif" },
};