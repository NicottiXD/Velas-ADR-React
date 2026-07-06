import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Search,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  X,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";

const REFRESH_SECONDS = 300;

const MAX_PCT_COLOR = 15;

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
  return `rgb(${lerp(a[0], b[0], t)},${lerp(a[1], b[1], t)},${lerp(
    a[2],
    b[2],
    t
  )})`;
}

function getCandleColor(closePct) {
  if (closePct == null || Number.isNaN(closePct)) return "#566178";
  const intensity = Math.min(Math.abs(closePct) / MAX_PCT_COLOR, 1);
  if (closePct > 0)
    return interpolateColor("#123527", "#3CE6A0", intensity);
  if (closePct < 0)
    return interpolateColor("#3B1620", "#FF5A6E", intensity);
  return "#566178";
}

function fmtPct(v) {
  const s = v.toFixed(2);
  return (v > 0 ? "+" : "") + s + "%";
}

function fmtPrice(v) {
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );

  // ✅ AHORA TODO VIENE DE TU BACKEND LOCAL
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/adrs");
      if (!res.ok) throw new Error("Error en /api/adrs");

      const data = await res.json();

      const rows = Array.isArray(data) ? data : data.rows;

      if (!rows?.length) {
        throw new Error("No llegaron datos desde /api/adrs");
      }

      setRawData(rows);
      setFailedTickers([]);
      setLastUpdate(new Date());

      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    } catch (e) {
      setError(e.message || "Error al consultar API local");
    } finally {
      setLoading(false);
      setSecondsLeft(REFRESH_SECONDS);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const candles = useMemo(
    () => rawData.map(deriveCandle),
    [rawData]
  );

  const filtered = useMemo(() => {
    let list = candles.filter((c) =>
      c.ticker.toLowerCase().includes(query.toLowerCase())
    );

    if (sortBy === "variacion")
      list = [...list].sort((a, b) => b.closePct - a.closePct);
    else if (sortBy === "alfabetico")
      list = [...list].sort((a, b) =>
        a.ticker.localeCompare(b.ticker)
      );

    return list;
  }, [candles, query, sortBy]);

  const maxAbs = useMemo(() => {
    if (!candles.length) return 5;
    const vals = candles.flatMap((c) => [
      Math.abs(c.highPct),
      Math.abs(c.lowPct),
    ]);
    return Math.max(...vals, 5) * 1.15;
  }, [candles]);

  const topGainer = useMemo(
    () =>
      candles.length
        ? [...candles].sort((a, b) => b.closePct - a.closePct)[0]
        : null,
    [candles]
  );

  const topLoser = useMemo(
    () =>
      candles.length
        ? [...candles].sort((a, b) => a.closePct - b.closePct)[0]
        : null,
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
  <div style={styles.grid}>
  {filtered.map((item) => (
    <div key={item.ticker} style={styles.card}>
      <div style={styles.ticker}>{item.ticker}</div>

      <div
        style={{
          ...styles.pct,
          color: item.closePct >= 0 ? "#3CE6A0" : "#FF5A6E",
        }}
      >
        {item.closePct?.toFixed(2)}%
      </div>

      <div style={styles.price}>
        ${item.close?.toFixed(2)}
      </div>
    </div>
  ))}
</div>
  );
}

const styles = {
  page: { background: "#0B1220", minHeight: "100vh", color: "#fff" },

  topBar: {
    display: "flex",
    justifyContent: "space-between",
    padding: 16,
    borderBottom: "1px solid #1A2740",
  },

  brand: { display: "flex", gap: 6 },
  brandMark: { color: "#D2A857" },
  brandRest: { color: "#7E8CAA" },

  topBarRight: { display: "flex", gap: 10, alignItems: "center" },
  liveDot: { width: 8, height: 8, borderRadius: "50%" },
  topBarText: { fontSize: 12, color: "#7E8CAA" },
  refreshBtn: { background: "transparent", border: "none", cursor: "pointer" },

  // 👇 ESTO ES LO NUEVO
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 12,
    padding: 20,
  },

  card: {
    background: "#111a2e",
    borderRadius: 12,
    padding: 14,
    border: "1px solid #1A2740",
  },

  ticker: {
    fontSize: 14,
    color: "#7E8CAA",
  },

  pct: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 6,
  },

  price: {
    fontSize: 12,
    color: "#7E8CAA",
    marginTop: 4,
  },
};