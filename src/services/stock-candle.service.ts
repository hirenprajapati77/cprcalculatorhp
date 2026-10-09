import YahooFinance from 'yahoo-finance2';
import { prisma } from '@/lib/db';
import { getISTDateString, isTodayCandleClosed } from '@/lib/market-hours';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

export interface AuthoritativeCandle {
  symbol: string;
  ticker: string;
  high: number;
  low: number;
  close: number;
  open: number;
  date: string;
  source: 'database' | 'yahoo';
}

/**
 * Maps clean stock/index symbols to their correct Yahoo Finance tickers.
 * Indices like NIFTY and BANKNIFTY require '^NSEI' and '^NSEBANK', not '.NS'.
 */
export function toYahooTicker(symbol: string, market: 'NSE' | 'BSE' = 'NSE'): string {
  const sym = symbol.trim().toUpperCase();
  if (sym === 'NIFTY' || sym === 'NIFTY50' || sym === 'NIFTY 50') return '^NSEI';
  if (sym === 'BANKNIFTY' || sym === 'NIFTYBANK' || sym === 'BANK NIFTY') return '^NSEBANK';
  if (sym === 'FINNIFTY' || sym === 'NIFTY_FIN_SERVICE') return 'NIFTY_FIN_SERVICE.NS';
  if (sym === 'MIDCPNIFTY') return '^NSEMDCP50';
  if (sym.startsWith('^') || sym.endsWith('.NS') || sym.endsWith('.BO')) return sym;
  return market === 'NSE' ? `${sym}.NS` : `${sym}.BO`;
}

/**
 * Fetches the authoritative last completed daily trading candle (OHLC) for a symbol or index.
 * For daily CPR calculation, the reference session is:
 * - Yesterday's completed candle if market is currently open today
 * - Today's completed candle if market has closed today (or on weekends/holidays)
 */
export async function fetchAuthoritativeCandle(
  symbol: string,
  market: 'NSE' | 'BSE' = 'NSE'
): Promise<AuthoritativeCandle | null> {
  const upperSymbol = symbol.trim().toUpperCase();
  if (!upperSymbol) return null;

  const ticker = toYahooTicker(upperSymbol, market);

  // 1. Primary: Fetch high-fidelity daily bars from Yahoo Finance
  try {
    const period1 = new Date(Date.now() - 15 * 86400000).toISOString();
    const res = await yf.chart(ticker, { interval: '1d', period1 });
    const rawQuotes = res.quotes || [];
    const quotes = rawQuotes.filter(
      (q) => q.high != null && q.low != null && q.close != null && q.open != null
    );

    if (quotes.length > 0) {
      const todayStr = getISTDateString();
      const last = quotes[quotes.length - 1]!;
      const lastDate = last.date instanceof Date ? getISTDateString(last.date) : String(last.date).split('T')[0]!;

      let target = last;
      if (lastDate === todayStr && !isTodayCandleClosed() && quotes.length >= 2) {
        target = quotes[quotes.length - 2]!;
      }

      return {
        symbol: upperSymbol,
        ticker,
        high: Number(target.high!.toFixed(2)),
        low: Number(target.low!.toFixed(2)),
        close: Number(target.close!.toFixed(2)),
        open: Number(target.open!.toFixed(2)),
        date: target.date instanceof Date ? getISTDateString(target.date) : String(target.date).split('T')[0]!,
        source: 'yahoo',
      };
    }
  } catch (err) {
    console.warn(`[StockCandleService] Yahoo chart fetch failed for ${upperSymbol} (${ticker}):`, err);
  }

  // 2. Secondary Fallback: Database Bhavcopy (DailyOhlcv) for equities
  try {
    const dbCandle = await prisma.dailyOhlcv.findFirst({
      where: { symbol: upperSymbol },
      orderBy: { date: 'desc' },
    });

    if (dbCandle) {
      return {
        symbol: upperSymbol,
        ticker,
        high: Number(dbCandle.high.toFixed(2)),
        low: Number(dbCandle.low.toFixed(2)),
        close: Number(dbCandle.close.toFixed(2)),
        open: Number(dbCandle.open.toFixed(2)),
        date: dbCandle.date,
        source: 'database',
      };
    }
  } catch (dbErr) {
    console.warn(`[StockCandleService] Database dailyOhlcv fallback failed for ${upperSymbol}:`, dbErr);
  }

  return null;
}
