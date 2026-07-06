import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const TICKERS = [
  "GGAL",
  "BMA",
  "YPF",
  "MELI",
  "SUPV",
  "CEPU",
  "PAM",
  "TGS",
  "CRESY",
  "BIOX",
  "EDN",
  "IRS",
  "LOMA",
  "TEO",
];

export default async function handler(req, res) {
  try {
    const quotes = await Promise.all(
      TICKERS.map(async (ticker) => {
        const quote = await yahooFinance.quote(ticker);

        return {
          ticker,
          open: quote.regularMarketOpen,
          high: quote.regularMarketDayHigh,
          low: quote.regularMarketDayLow,
          close: quote.regularMarketPrice,
          prevClose: quote.regularMarketPreviousClose,
        };
      })
    );

    res.status(200).json(quotes);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
}