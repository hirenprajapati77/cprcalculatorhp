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
import {
  getISTDateString,
  getISTTime,
  BTST_CLOCK,
  BTST_WINDOW_MINUTES,
  isInClosingLiquidityWindow,
  istMinuteOfDayFromUnixSec,
} from '@/lib/market-hours';
import { HistoricalProvider } from '../backtest/historical.provider';
import {
  IndexRankingService,
  IndexClassification,
  INDEX_SCORE,
  INDIA_VIX_CALM_MAX,
  INDIA_VIX_ELEVATED_MIN,
} from './index-ranking.service';
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
  last15mHigh: number | null;
}

export interface IndiaVixState {
  /** True when latest VIX close >= INDIA_VIX_ELEVATED_MIN — overnight LONG forced IGNORE. */
  elevated: boolean;
  /**
   * true → award Rule 1 calm pts; false → scoreable but no calm pts;
   * null → unavailable / mock (score-safety INVALID).
   */
  vixCalm: boolean | null;
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
   * Fetches intraday 5m data for VWAP + last-15m high (15:15–15:30 IST),
   * matching OvernightService's closing-liquidity window logic.
   * On any failure, returns hasIntraday: false so the caller's score-safety
   * check returns a null score rather than guessing.
   */
  private static async getIntradayMetrics(
    yahooSymbol: string,
    currentTime: Date
  ): Promise<IndexIntradayMetrics> {
    const mode = env.HISTORICAL_MODE || 'mock';
    if (mode !== 'live') {
      // Mock mode: no live VWAP / last15m source. Score-safety will correctly
      // return null scores — expected and matches the stock mock path.
      return { vwap: null, hasIntraday: false, last15mHigh: null };
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
        return { vwap: null, hasIntraday: false, last15mHigh: null };
      }

      const currentTimestampSec = Math.floor(currentTime.getTime() / 1000);
      let sumPriceVol = 0;
      let sumVol = 0;
      let hasIntraday = false;
      let closingHigh = 0;
      let closingBarCount = 0;

      const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
      const isLastCandleForming = currentTimestampSec - lastTimestamp < 300;

      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        if (ts > currentTimestampSec) continue;
        const high = quotes.high[i];
        const low = quotes.low[i];
        const close = quotes.close[i];
        const volume = quotes.volume[i] || 0;
        if (high == null || low == null || close == null) continue;

        const typicalPrice = (high + low + close) / 3;
        sumPriceVol += typicalPrice * volume;
        sumVol += volume;
        hasIntraday = true;

        const barOpenMin = istMinuteOfDayFromUnixSec(ts);
        const inClosingWindow = isInClosingLiquidityWindow(barOpenMin);
        const isFormingBar = isLastCandleForming && ts === lastTimestamp;
        // Include forming bar when it belongs to the 15:15–15:30 window (partial MOC data).
        if (inClosingWindow && (!isFormingBar || barOpenMin >= BTST_WINDOW_MINUTES.CLOSING_WINDOW_START)) {
          closingHigh = Math.max(closingHigh, high);
          closingBarCount++;
        }
      }

      const last15mHigh =
        closingBarCount > 0 && closingHigh > 0 ? closingHigh : null;

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
        return {
          vwap: count > 0 ? sumClose / count : null,
          hasIntraday: count > 0,
          last15mHigh,
        };
      }

      return {
        vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
        hasIntraday,
        last15mHigh,
      };
    } catch (err) {
      console.warn(`[IndexDiscover] Intraday fetch failed for ${yahooSymbol}:`, err instanceof Error ? err.message : err);
      return { vwap: null, hasIntraday: false, last15mHigh: null };
    }
  }

  /**
   * India VIX regime for overnight LONG gating / Rule 1 calm points.
   * - elevated (close >= 25): discover forces IGNORE
   * - calm (close < 20): award 25 pts
   * - otherwise: scoreable, calm=false (no calm pts)
   * - mock / unavailable: vixCalm null → score-safety INVALID
   */
  static async getIndiaVixState(date: Date): Promise<IndiaVixState> {
    const mode = env.HISTORICAL_MODE || 'mock';
    if (mode !== 'live') {
      return { elevated: false, vixCalm: null };
    }

    try {
      const endDateObj = new Date(date);
      const startDateObj = new Date(date);
      startDateObj.setDate(startDateObj.getDate() - 30);

      const history = await HistoricalProvider.getHistory('^INDIAVIX', startDateObj, endDateObj);
      if (!history || history.length === 0) {
        return { elevated: false, vixCalm: null };
      }

      const latestClose = history[history.length - 1].close;
      if (latestClose >= INDIA_VIX_ELEVATED_MIN) {
        return { elevated: true, vixCalm: false };
      }
      if (latestClose < INDIA_VIX_CALM_MAX) {
        return { elevated: false, vixCalm: true };
      }
      return { elevated: false, vixCalm: false };
    } catch (err) {
      console.warn(
        '[IndexDiscover] India VIX fetch failed:',
        err instanceof Error ? err.message : err
      );
      return { elevated: false, vixCalm: null };
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
    const vixState = await this.getIndiaVixState(currentTime);

    for (const instrument of INDEX_INSTRUMENTS) {
      try {
        // Elevated VIX: force IGNORE with null score/levels — do not invent setups.
        if (vixState.elevated) {
          results.push({
            symbol: instrument.symbol,
            signalDate: dateStr,
            signalTime: timeStr,
            direction: 'LONG',
            score: null,
            classification: 'IGNORE',
            entry: null,
            stopLoss: null,
            target: null,
          });
          continue;
        }

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

        const intraday = await this.getIntradayMetrics(instrument.yahooSymbol, currentTime);

        const details = IndexRankingService.calculateScoreDetails({
          tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
          tomorrowBc: tomorrowCpr.bc,
          tomorrowTc: tomorrowCpr.tc,
          todayBc: todayCpr.bc,
          todayTc: todayCpr.tc,
          close: todayCandle.close,
          high: todayCandle.high,
          low: todayCandle.low,
          vwap: intraday.vwap,
          last15mHigh: intraday.last15mHigh,
          vixCalm: vixState.vixCalm,
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
   * Map INTRA CPR scores onto INDEX_* using INDEX_SCORE floors (aligned with
   * stock ADVANCED_SCORE / overnight BTST gates). Never leak A+/A/B into
   * OvernightSignal stock filters — INTRA rows are not persisted.
   */
  static mapIntraClassification(score: number): IndexClassification {
    if (score >= INDEX_SCORE.STRONG) return 'INDEX_STRONG';
    if (score >= INDEX_SCORE.READY) return 'INDEX_READY';
    if (score >= INDEX_SCORE.WATCH) return 'INDEX_WATCH';
    return 'IGNORE';
  }

  /**
   * Scans the fixed index instrument list and returns scored INTRA signals.
   * Leverages SignalService and RankingService to match the stock CPR logic.
   */
  static async discoverIntraday(dateOverride?: Date): Promise<IndexSignalResult[]> {
    const currentTime = dateOverride || new Date();
    const dateStr = getISTDateString(currentTime);
    const timeStr = currentTime.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const { isTradingDay } = getISTTime(currentTime);
    if (!isTradingDay) {
      return [];
    }

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

        const lastCandle = history[history.length - 1];
        // Daily history close as LTP proxy — no live index tick feed in Phase 1.
        const ltp = lastCandle.close;
        const previousClose =
          history.length >= 2 ? history[history.length - 2].close : lastCandle.close;

        const stockData: MarketStockData = {
          symbol: instrument.symbol,
          market: 'NSE',
          sector: 'INDEX',
          ltp,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume || 0,
          avgVolume: 0,
          marketCap: 0,
          previousClose,
          history,
        };

        const signalResult = SignalService.getSignals(stockData);
        // Volume is meaningless for spot-index charts here — force ratio fallback off
        // by passing zeros (RankingService treats avgVolume<=0 as ratio=1, no spike pts).
        const score = RankingService.calculateScore({
          ...stockData,
          ...signalResult,
          pivot: 0,
          bc: 0,
          tc: 0,
          r1: 0,
          r2: 0,
          r3: 0,
          r4: 0,
          s1: 0,
          s2: 0,
          s3: 0,
          s4: 0,
          width: 0,
          classification: 'NORMAL',
          entry: 0,
          sl: 0,
          target: 0,
          rr: '1:0',
          volume: 0,
          avgVolume: 0,
        } as ScannerSignalResult);

        const bullish = signalResult.signals.includes('BULLISH');
        const bearish = signalResult.signals.includes('BEARISH');
        // Do not invent LONG when price is inside CPR with no directional tag.
        if (!bullish && !bearish) {
          results.push({
            symbol: instrument.symbol,
            signalDate: dateStr,
            signalTime: timeStr,
            direction: 'LONG',
            score: null,
            classification: 'IGNORE',
            entry: null,
            stopLoss: null,
            target: null,
          });
          continue;
        }

        const direction: 'LONG' | 'SHORT' = bullish ? 'LONG' : 'SHORT';
        const classification = this.mapIntraClassification(score);

        // IGNORE setups must not advertise entry/SL/target (matches BTST score-safety UX).
        if (classification === 'IGNORE') {
          results.push({
            symbol: instrument.symbol,
            signalDate: dateStr,
            signalTime: timeStr,
            direction,
            score,
            classification,
            entry: null,
            stopLoss: null,
            target: null,
          });
          continue;
        }

        const atrPct = getAtrPct(history.slice(0, -1), previousClose);
        const yesterdayCandle = history.length >= 2 ? history[history.length - 2] : lastCandle;
        const realCpr = calculateCPR(
          { high: yesterdayCandle.high, low: yesterdayCandle.low, close: yesterdayCandle.close },
          atrPct
        );

        // LONG enters near TC / SHORT near BC — never reuse TC for both sides.
        const entry = direction === 'LONG' ? realCpr.tc : realCpr.bc;
        const sl = direction === 'LONG' ? realCpr.bc : realCpr.tc;
        const target = direction === 'LONG' ? realCpr.r1 : realCpr.s1;

        results.push({
          symbol: instrument.symbol,
          signalDate: dateStr,
          signalTime: timeStr,
          direction,
          score,
          classification,
          entry,
          stopLoss: sl,
          target,
        });
      } catch (err) {
        console.error(`[IndexDiscover] Error scanning INTRA for ${instrument.symbol}:`, err);
      }
    }

    return results;
  }
}
