/**
 * Phase 1 index discovery — deliberately isolated from OvernightService.
 * Fixed instrument list (NIFTY, BANKNIFTY), no F&O universe loop, no
 * EntryManagerService liquidity gate (that gate exists for stock
 * avgVolume/volumeRatio concerns that don't apply to an index).
 *
 * Reuses the same building blocks as the stock pipeline where they're
 * genuinely shared (calculateCPR, getAtrPct, HistoricalProvider), but does
 * not import from or modify overnight.service.ts, btst-ranking.service.ts,
 * stbt-ranking.service.ts, or entry-manager.service.ts.
 */
import { env } from '@/config/env';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { getISTDateString, getISTTime, BTST_CLOCK } from '@/lib/market-hours';
import { HistoricalProvider } from '../backtest/historical.provider';
import { IndexRankingService, IndexClassification } from './index-ranking.service';
import { SignalService } from '../signal.service';
import { RankingService } from '../ranking.service';
import { MarketStockData } from '../market.service';
import { ScannerSignalResult } from '../scanner.service';

export interface IndexInstrument {
  /** Display/storage symbol, e.g. "NIFTY". */
  symbol: string;
  /** Yahoo Finance symbol, e.g. "^NSEI" — caret prefix means HistoricalProvider
   *  and the intraday fetch below skip the ".NS" suffix used for stocks. */
  yahooSymbol: string;
}

export const INDEX_INSTRUMENTS: IndexInstrument[] = [
  { symbol: 'NIFTY', yahooSymbol: '^NSEI' },
  { symbol: 'BANKNIFTY', yahooSymbol: '^NSEBANK' },
];

export interface IndexSignalResult {
  symbol: string;
  signalDate: string;
  signalTime: string;
  direction: 'LONG' | 'SHORT';
  score: number | null;
  classification: IndexClassification;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
}

interface IndexIntradayMetrics {
  vwap: number | null;
  hasIntraday: boolean;
}

interface YahooFinanceChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
}

export class IndexDiscoverService {
  /**
   * Fetches intraday 5m data for VWAP. Mirrors the shape of
   * OvernightService.getIntradayData's live branch but simplified — Phase 1
   * only needs VWAP, not last-15m high/low (index scoring has no liquidity
   * rule). On any failure, returns hasIntraday: false so the caller's
   * score-safety check returns a null score rather than guessing.
   */
  private static async getIntradayVwap(
    yahooSymbol: string,
    currentTime: Date
  ): Promise<IndexIntradayMetrics> {
    const mode = env.HISTORICAL_MODE || 'mock';
    if (mode !== 'live') {
      // Mock mode: no live VWAP source. Score-safety will correctly return
      // null scores in mock mode — this is expected and matches how the
      // stock pipeline's mock path supplies vwap via MockOvernightStock
      // overrides instead of a real fetch.
      return { vwap: null, hasIntraday: false };
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=1d`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      let json: YahooFinanceChartResponse;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Live fetch HTTP ${response.status}`);
        json = (await response.json()) as YahooFinanceChartResponse;
      } finally {
        clearTimeout(timeout);
      }

      const result = json?.chart?.result?.[0];
      const timestamps = result?.timestamp;
      const quotes = result?.indicators?.quote?.[0];
      if (!result || !timestamps || !quotes || !quotes.high || !quotes.low || !quotes.close || !quotes.volume) {
        return { vwap: null, hasIntraday: false };
      }

      const currentTimestampSec = Math.floor(currentTime.getTime() / 1000);
      let sumPriceVol = 0;
      let sumVol = 0;
      let hasIntraday = false;

      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] > currentTimestampSec) continue;
        const high = quotes.high[i];
        const low = quotes.low[i];
        const close = quotes.close[i];
        const volume = quotes.volume[i] || 0;
        if (high == null || low == null || close == null) continue;

        const typicalPrice = (high + low + close) / 3;
        sumPriceVol += typicalPrice * volume;
        sumVol += volume;
        hasIntraday = true;
      }

      // Index futures volume can be legitimately thin/zero on the underlying
      // spot chart depending on source; fall back to a simple average price
      // (not volume-weighted) if volume is unavailable but candles exist,
      // rather than discarding real price data.
      if (hasIntraday && sumVol === 0) {
        let sumClose = 0;
        let count = 0;
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] > currentTimestampSec) continue;
          const close = quotes.close[i];
          if (close == null) continue;
          sumClose += close;
          count++;
        }
        return { vwap: count > 0 ? sumClose / count : null, hasIntraday: count > 0 };
      }

      return {
        vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
        hasIntraday,
      };
    } catch (err) {
      console.warn(`[IndexDiscover] Intraday fetch failed for ${yahooSymbol}:`, err instanceof Error ? err.message : err);
      return { vwap: null, hasIntraday: false };
    }
  }

  /**
   * Scans the fixed index instrument list and returns scored LONG signals.
   * Never persists to the database — callers decide whether/how to store
   * (kept out of this file so Stage 1 has zero Prisma dependency).
   */
  static async discover(dateOverride?: Date): Promise<IndexSignalResult[]> {
    const currentTime = dateOverride || new Date();
    const dateStr = getISTDateString(currentTime);
    // Stable per-day signalTime so OvernightSignal upserts update one row
    // per index/day instead of inserting a new row on every refresh minute.
    const timeStr = BTST_CLOCK.discoveryStart;

    const results: IndexSignalResult[] = [];

    for (const instrument of INDEX_INSTRUMENTS) {
      try {
        const endDateObj = new Date(currentTime);
        const startDateObj = new Date(currentTime);
        startDateObj.setDate(startDateObj.getDate() - 90);

        const history = await HistoricalProvider.getHistory(instrument.yahooSymbol, startDateObj, endDateObj);

        if (!history || history.length < 15) {
          console.warn(`[IndexDiscover] ${instrument.symbol} skipped: insufficient history (${history?.length ?? 0} candles).`);
          continue;
        }

        const { isTradingDay } = getISTTime(currentTime);
        if (!isTradingDay) {
          continue;
        }

        // Same today/yesterday candle selection intent as OvernightService:
        // the most recent completed candle is "today", the one before it is
        // "yesterday" — Phase 1 always works off completed daily bars (no
        // in-progress-candle handling yet, since index EOD data settles
        // cleanly via HistoricalProvider unlike the stock live-quote path).
        const todayCandle = history[history.length - 1];
        const yesterdayCandle = history[history.length - 2];

        const atrPct = getAtrPct(history.slice(0, -1), yesterdayCandle.close);

        const todayCpr = calculateCPR(
          { high: yesterdayCandle.high, low: yesterdayCandle.low, close: yesterdayCandle.close },
          atrPct
        );
        const tomorrowCpr = calculateCPR(
          { high: todayCandle.high, low: todayCandle.low, close: todayCandle.close },
          atrPct
        );

        const intraday = await this.getIntradayVwap(instrument.yahooSymbol, currentTime);

        const details = IndexRankingService.calculateScoreDetails({
          tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
          tomorrowBc: tomorrowCpr.bc,
          tomorrowTc: tomorrowCpr.tc,
          todayBc: todayCpr.bc,
          todayTc: todayCpr.tc,
          close: todayCandle.close,
          vwap: intraday.vwap,
          hasConfirmationCandles: intraday.hasIntraday,
        });

        const cls = IndexRankingService.getClassification(details.score);
        const sl = Math.min(todayCandle.low, tomorrowCpr.bc);
        const risk = todayCandle.close - sl;
        const target = risk > 0 ? todayCandle.close + risk * 2 : null;

        results.push({
          symbol: instrument.symbol,
          signalDate: dateStr,
          signalTime: timeStr,
          direction: 'LONG',
          score: details.score,
          classification: cls,
          entry: details.score !== null ? todayCandle.close : null,
          stopLoss: details.score !== null ? sl : null,
          target: details.score !== null ? target : null,
        });
      } catch (err) {
        console.error(`[IndexDiscover] Error scanning ${instrument.symbol}:`, err instanceof Error ? err.message : err);
      }
    }

    return results;
  }

  /**
   * Scans the fixed index instrument list and returns scored INTRA signals.
   * Leverages SignalService and RankingService to match the stock CPR logic.
   */
  static async discoverIntraday(dateOverride?: Date): Promise<IndexSignalResult[]> {
    const currentTime = dateOverride || new Date();
    const dateStr = getISTDateString(currentTime);
    const timeStr = currentTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

    const results: IndexSignalResult[] = [];

    for (const instrument of INDEX_INSTRUMENTS) {
      try {
        const endDateObj = new Date(currentTime);
        const startDateObj = new Date(currentTime);
        startDateObj.setDate(startDateObj.getDate() - 90);

        const history = await HistoricalProvider.getHistory(instrument.yahooSymbol, startDateObj, endDateObj);

        if (!history || history.length < 15) {
          continue;
        }

        const { isTradingDay } = getISTTime(currentTime);
        const lastCandle = history[history.length - 1];
        const isLastToday = lastCandle.date === dateStr;

        // In live mode, Yahoo might not have the very latest tick.
        // For accurate intraday scoring, we need the live LTP. Since we don't have a live
        // tick feed here for indices, we use the last candle's close as a proxy.
        const ltp = lastCandle.close;

        const stockData = {
          symbol: instrument.symbol,
          ltp: ltp,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume || 0,
          avgVolume: 0,
          previousClose: history.length >= 2 ? history[history.length - 2].close : lastCandle.close,
          history: history,
        } as unknown as MarketStockData;

        const signalResult = SignalService.getSignals(stockData);
        const score = RankingService.calculateScore({ ...signalResult, volume: 0, avgVolume: 0 } as unknown as ScannerSignalResult);
        
        // Map signals
        const direction = signalResult.signals.includes('BULLISH') ? 'LONG' : (signalResult.signals.includes('BEARISH') ? 'SHORT' : 'LONG');
        
        // Approximate Entry/SL/Target from CPR
        const atrPct = getAtrPct(history.slice(0, -1), stockData.previousClose || lastCandle.close);
        const yesterdayCandle = history.length >= 2 ? history[history.length - 2] : lastCandle;
        const realCpr = calculateCPR({ high: yesterdayCandle.high, low: yesterdayCandle.low, close: yesterdayCandle.close }, atrPct);

        const sl = direction === 'LONG' ? realCpr.bc : realCpr.tc;
        const target = direction === 'LONG' ? realCpr.r1 : realCpr.s1;

        results.push({
          symbol: instrument.symbol,
          signalDate: dateStr,
          signalTime: timeStr,
          direction: direction as 'LONG' | 'SHORT',
          score: score,
          classification: RankingService.getClassification(score) as string,
          entry: realCpr.tc,
          stopLoss: sl,
          target: target,
        } as IndexSignalResult);

      } catch (err) {
        console.error(`[IndexDiscover] Error scanning INTRA for ${instrument.symbol}:`, err);
      }
    }

    return results;
  }
}
