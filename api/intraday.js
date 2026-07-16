import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Devuelve un string "YYYY-MM-DD" en la hora local del exchange,
// usando el gmtoffset (segundos) que trae Yahoo en meta.
function exchangeLocalDateStr(date, gmtoffsetSeconds) {
  const shifted = new Date(date.getTime() + gmtoffsetSeconds * 1000);
  return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`;
}

export default async function handler(req, res) {
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: "Falta el parámetro ticker" });
  }

  try {
    // Pedimos 3 días hacia atrás como margen de seguridad
    // (fin de semana, feriados, desfasaje de huso) y después
    // filtramos para quedarnos solo con la última sesión.
    const period1 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const result = await yahooFinance.chart(ticker, {
      period1,
      interval: "2m",
    });

    const allPoints = (result.quotes || []).filter((q) => q.close != null);

    if (allPoints.length === 0) {
      return res.status(200).json({
        ticker,
        prevClose: result.meta?.chartPreviousClose ?? null,
        points: [],
      });
    }

    const gmtoffset = result.meta?.gmtoffset ?? 0;
    const lastDateStr = exchangeLocalDateStr(
      allPoints[allPoints.length - 1].date,
      gmtoffset
    );

    const points = allPoints
      .filter((q) => exchangeLocalDateStr(q.date, gmtoffset) === lastDateStr)
      .map((q) => ({
        time: q.date,
        price: q.close,
      }));

    res.status(200).json({
      ticker,
      prevClose: result.meta?.chartPreviousClose ?? null,
      points,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}