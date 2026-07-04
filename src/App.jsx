import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, RefreshCw, ArrowUp, ArrowDown, X, TrendingUp, TrendingDown } from "lucide-react";

// ============================================================= //
// DATOS DE MUESTRA
// Misma estructura que produce el script Python (fetch_watchlist).
// Para conectar datos reales: reemplazar esta constante por un
// fetch() a un endpoint propio (Flask/FastAPI) que exponga el
// mismo JSON, dado que yfinance no puede llamarse desde el
// navegador (sin CORS, es una librería de Python).
// ============================================================= //
const RAW_DATA = [
  { ticker: "GGAL", open: 32.4, high: 34.9, low: 32.0, close: 34.5, prevClose: 32.1 },
  { ticker: "BMA", open: 45.5, high: 53.2, low: 44.8, close: 52.8, prevClose: 45.0 },
  { ticker: "YPF", open: 40.0, high: 41.2, low: 38.7, close: 39.1, prevClose: 40.1 },
  { ticker: "MELI", open: 2060, high: 2085, low: 2040, close: 2078, prevClose: 2050 },
  { ticker: "SUPV", open: 6.35, high: 6.5, low: 6.1, close: 6.15, prevClose: 6.4 },
  { ticker: "CEPU", open: 11.0, high: 11.1, low: 9.7, close: 9.85, prevClose: 11.2 },
  { ticker: "PAM", open: 29.4, high: 32.1, low: 29.1, close: 31.8, prevClose: 29.0 },
  { ticker: "TGS", open: 21.6, high: 22.0, low: 21.3, close: 21.85, prevClose: 21.5 },
  { ticker: "CRESY", open: 12.35, high: 12.55, low: 12.1, close: 12.42, prevClose: 12.3 },
  { ticker: "BIOX", open: 4.15, high: 4.6, low: 4.1, close: 4.55, prevClose: 4.1 },
  { ticker: "EDN", open: 20.0, high: 22.1, low: 19.9, close: 21.9, prevClose: 19.8 },
  { ticker: "IRS", open: 10.7, high: 11.6, low: 10.6, close: 11.5, prevClose: 10.6 },
  { ticker: "LOMA", open: 9.1, high: 10.2, low: 9.0, close: 10.1, prevClose: 9.0 },
  { ticker: "TEO", open: 10.5, high: 10.7, low: 8.9, close: 9.0, prevClose: 10.6 },
];

const MAX_PCT_COLOR = 15; // variación % a la que el color llega a su máxima intensidad
const REFRESH_SECONDS = 300; // 5 minutos, igual que UPDATE_INTERVAL del script

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
  const candles = useMemo(() => RAW_DATA.map(deriveCandle), []);

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("variacion");
  const [selected, setSelected] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_SECONDS);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [flash, setFlash] = useState(false);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setLastUpdate(new Date());
          setFlash(true);
          setTimeout(() => setFlash(false), 900);
          return REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    let list = candles.filter((c) => c.ticker.toLowerCase().includes(query.toLowerCase()));
    if (sortBy === "variacion") list = [...list].sort((a, b) => b.closePct - a.closePct);
    else if (sortBy === "alfabetico") list = [...list].sort((a, b) => a.ticker.localeCompare(b.ticker));
    return list;
  }, [candles, query, sortBy]);

  const maxAbs = useMemo(() => {
    const vals = candles.flatMap((c) => [Math.abs(c.highPct), Math.abs(c.lowPct)]);
    return Math.max(...vals, 5) * 1.15;
  }, [candles]);

  const topGainer = useMemo(() => [...candles].sort((a, b) => b.closePct - a.closePct)[0], [candles]);
  const topLoser = useMemo(() => [...candles].sort((a, b) => a.closePct - b.closePct)[0], [candles]);

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
        .live-dot { animation: pulseDot 1.8s ease-in-out infinite; }
        .flash-ring { animation: flashRing 0.9s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .live-dot { animation: none; }
          .flash-ring { animation: none; }
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
          <span style={{ ...styles.liveDot, backgroundColor: "#3CE6A0" }} className="live-dot" />
          <span style={styles.topBarText}>
            Actualizado {lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span style={styles.topBarDivider} />
          <RefreshCw size={13} color="#7E8CAA" />
          <span style={styles.topBarText}>Próxima en {mm}:{ss}</span>
        </div>
      </div>

      {/* ---- Encabezado ---- */}
      <div style={styles.header}>
        <h1 style={styles.title}>Horizonte diario</h1>
        <p style={styles.subtitle}>ADRs Argentina — variación vs. cierre anterior (%)</p>
      </div>

      {/* ---- Callouts subida / bajada ---- */}
      <div style={styles.calloutRow}>
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
  header: { marginTop: 24, marginBottom: 4 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  subtitle: { color: "#7E8CAA", fontSize: 13, marginTop: 4 },
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
