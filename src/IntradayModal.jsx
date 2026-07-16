import { useEffect, useState } from "react";

export default function IntradayModal({ ticker, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/intraday?ticker=${ticker}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [ticker]);

  if (!ticker) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{ticker}</span>
          <button onClick={onClose}>×</button>
        </div>

        {loading && <p>Cargando...</p>}
        {!loading && data && data.points.length > 0 && (
          <IntradayChart points={data.points} prevClose={data.prevClose} />
        )}
        {!loading && (!data || data.points.length === 0) && (
          <p>Sin datos intradiarios disponibles.</p>
        )}
      </div>
    </div>
  );
}

function IntradayChart({ points, prevClose }) {
  const width = 700;
  const height = 300;
  const padding = 30;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices, prevClose);
  const max = Math.max(...prices, prevClose);
  const range = max - min || 1;

  const x = (i) =>
    padding + (i / (points.length - 1)) * (width - padding * 2);
  const y = (price) =>
    height - padding - ((price - min) / range) * (height - padding * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.price)}`)
    .join(" ");

  const lastPrice = points[points.length - 1].price;
  const color = lastPrice >= prevClose ? "#22c55e" : "#ef4444";

  const areaPath = `${linePath} L ${x(points.length - 1)} ${height - padding} L ${x(0)} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%">
      <path d={areaPath} fill={color} opacity="0.15" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" />
      <line
        x1={padding}
        x2={width - padding}
        y1={y(prevClose)}
        y2={y(prevClose)}
        stroke="#888"
        strokeDasharray="4 4"
      />
      <text x={width - padding} y={y(prevClose) - 4} fill="#888" fontSize="11" textAnchor="end">
        Cierre anterior {prevClose}
      </text>
    </svg>
  );
}