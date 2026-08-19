import { env } from '@/config/env';
/**
 * ADVANCED ENGINE — authoritative for live UI (/api/btst adapter), Telegram
 * (btst-alert), Trade Journal (btst-journal), BTST_STBT_DRIVEN backtest, and
 * /api/overnight. Max score 130. Simple Engine (BtstService) is V2 shadow only.
 */
import { OvernightSignal, Prisma } from '@prisma/client';
import { LIQUIDITY } from '@/config/trading-constants';
import { prisma } from '@/lib/db';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { calculateRSI } from '@/lib/rsi';
import { detectEmaCross } from '@/lib/ema';
import { MarketService, MarketStockData } from '../market.service';
import { BtstRankingService } from './btst-ranking.service';
import { StbtRankingService } from './stbt-ranking.service';
import { GapProbabilityService } from './gap-probability.service';
import { EntryManagerService } from './entry-manager.service';
import { getISTTime, getISTDateString, isTodayCandleClosed, getBtstWindowState, BTST_WINDOW_MINUTES, isInClosingLiquidityWindow, getCompletedHistory } from '@/lib/market-hours';
import { EventCalendarService } from './event.service';
import { parseStockIntradayMetricsFromChart } from './stock-intraday.util';
import {
  parseStockIntradayMetricsFromFyersCandles,
  type FyersHistoryCandle,
} from './fyers-intraday.util';
import type { YahooFinanceChartResponse } from './index-intraday.util';
import { RegimeService, RS_LOOKBACK } from './regime.service';
import { SignalQualityService } from './signal-quality.service';
import { resolveOvernightConflict } from './overnight-conflict';
import { isVpaLiveGatesEnabled } from '@/config/vpa.config';
import type { VpaConfirmationResult } from '@/services/vpa';
import { safeRatio } from '@/lib/math';
import { FyersAuthService } from '../fyers-auth.service';

/**
 * Concurrent Yahoo/chart fetches per batch when preloading the F&O universe.
 * Kept modest on Oracle 1GB + Fyers 429 pressure (was 15; live scans already
 * hit RSS near the old PM2 cap).
 */
const STOCK_DATA_PREFETCH_CHUNK = 8;

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit'
});
export interface MockOvernightStock extends MarketStockData {
  longScoreOverride?: number;
  shortScoreOverride?: number;
}


interface OvernightSignalCalc {
  score: number | null;
  cls: string;
  sl: number;
  target: number;
  scoreBreakdown?: import('./btst-ranking.service').AdvancedScoreBreakdown | null;
  vpaBreakdown?: VpaConfirmationResult | null;
}

export interface OvernightIntradayMetrics {
  vwap: number | null;
  intradayVolume: number | null;
  last15mHigh: number | null;
  last15mLow: number | null;
  hasIntraday: boolean;
}

export class OvernightService {
  static getISTTime(date: Date = new Date()) {
    const { hour, minute, totalMinutes } = getISTTime(date);
    return { hour, minute, totalMinutes };
  }

  /**
   * Helper to determine signal state from BTST_WINDOWS via getBtstWindowState.
   *
   * NOTE: This env-var bypass (BTST_BYPASS_WINDOW=true, dev-only) is a separate mechanism
   * from the user-facing ?bypass=true query param handled at the API route level.
   * Do NOT merge the two — the query-param bypass should never affect cron jobs or
   * other callers of determineState().
   */
  static determineState(time: Date): 'DISCOVERING' | 'ACTIVE' | 'FROZEN' {
    const bypassAllowed =
      env.NODE_ENV !== 'production' && env.BTST_BYPASS_WINDOW === 'true';

    if (bypassAllowed) {
      return 'ACTIVE';
    }

    return getBtstWindowState(time);
  }

  /**
   * Fetches/simulates intraday 5m candle data to compute VWAP and 15:15–15:30 high/low.
   * Live: Yahoo 5m first, Fyers 5m history as fallback when Yahoo flakes (Rule 5 needs this).
   */
  static async getIntradayData(stock: MarketStockData, currentTime: Date): Promise<OvernightIntradayMetrics> {
    const mode = env.HISTORICAL_MODE || 'mock';

    if (mode === 'live') {
      const symbol = stock.symbol;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=5m&range=1d`;

      const fetchYahoo = async (): Promise<OvernightIntradayMetrics> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`Live fetch HTTP ${response.status}`);
          const json = await response.json() as YahooFinanceChartResponse;
          const parsed = parseStockIntradayMetricsFromChart(json, currentTime);
          if (!parsed.hasIntraday) {
            throw new Error('Live fetch returned empty intraday data');
          }
          return parsed;
        } finally {
          clearTimeout(timeout);
        }
      };

      try {
        return await fetchYahoo();
      } catch (err) {
        console.warn(
          `[Overnight] Yahoo intraday failed for ${stock.symbol} — trying Fyers 5m:`,
          err instanceof Error ? err.message : err
        );
        try {
          await new Promise((r) => setTimeout(r, 400));
          const fyers = await this.fetchFyersIntradayMetrics(stock, currentTime);
          if (fyers?.hasIntraday) {
            console.log(`[Overnight] Fyers 5m fallback OK for ${stock.symbol}`);
            return fyers;
          }
          // One Yahoo retry after Fyers miss
          return await fetchYahoo();
        } catch (retryErr) {
          console.error(
            `[Overnight] Intraday Yahoo+Fyers failed for ${stock.symbol} — excluding from scan:`,
            retryErr instanceof Error ? retryErr.message : retryErr
          );
          return { vwap: null, intradayVolume: null, last15mHigh: null, last15mLow: null, hasIntraday: false };
        }
      }
    } else {
      const { totalMinutes } = OvernightService.getISTTime(currentTime);

      const startMinutes = BTST_WINDOW_MINUTES.MARKET_OPEN;
      let elapsedCandles = Math.floor((totalMinutes - startMinutes) / 5);
      if (elapsedCandles < 0) elapsedCandles = 0;
      if (elapsedCandles > 73) elapsedCandles = 73;

      const allCandles = this.generateDeterministicMock5mCandles(stock.symbol, currentTime, stock.ltp, stock.volume);

      let sumPriceVol = 0;
      let sumVol = 0;

      const activeCandles = allCandles.slice(0, elapsedCandles + 1);

      for (const candle of activeCandles) {
        sumPriceVol += candle.price * candle.volume;
        sumVol += candle.volume;
      }

      const settledCandles = activeCandles;

      let closingHigh = 0;
      let closingLow = Infinity;
      let closingBarCount = 0;
      for (let i = 0; i < settledCandles.length; i++) {
        const barOpenMin = BTST_WINDOW_MINUTES.MARKET_OPEN + i * 5;
        if (!isInClosingLiquidityWindow(barOpenMin)) continue;
        const c = settledCandles[i];
        closingHigh = Math.max(closingHigh, c.high);
        closingLow = Math.min(closingLow, c.low);
        closingBarCount++;
      }

      return {
        vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
        intradayVolume: sumVol > 0 ? sumVol : null,
        last15mHigh: closingBarCount > 0 && closingHigh > 0 ? closingHigh : null,
        last15mLow: closingBarCount > 0 && closingLow !== Infinity ? closingLow : null,
        hasIntraday: activeCandles.length > 0
      };
    }
  }

  /** Fyers 5m history for overnight Rule 5 when Yahoo chart is unavailable. */
  private static async fetchFyersIntradayMetrics(
    stock: MarketStockData,
    currentTime: Date
  ): Promise<OvernightIntradayMetrics | null> {
    try {
      if (MarketService.isFyersTemporarilyUnavailable()) {
        return null;
      }
      const token = await FyersAuthService.getAccessToken();
      if (!token) return null;
      const { appId } = FyersAuthService.getCredentials();
      const market = stock.market === 'BSE' ? 'BSE' : 'NSE';
      const clean = stock.symbol.split(':')[0].trim();
      const fyersSymbol = market === 'NSE' ? `NSE:${clean}-EQ` : `BSE:${clean}-EQ`;
      const rangeDay = getISTDateString(currentTime);

      const historyUrl =
        `https://api-t1.fyers.in/data/history?` +
        new URLSearchParams({
          symbol: fyersSymbol,
          resolution: '5',
          date_format: '1',
          range_from: rangeDay,
          range_to: rangeDay,
          cont_flag: '1',
        }).toString();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.FYERS_REQUEST_TIMEOUT_MS || 10000);
      try {
        const res = await fetch(historyUrl, {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            Authorization: `${appId}:${token}`,
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          MarketService.noteFyersHttpFailure(res.status);
          console.warn(`[Overnight] Fyers 5m HTTP ${res.status} for ${fyersSymbol}`);
          return null;
        }
        const json = (await res.json()) as { s?: string; code?: number; candles?: FyersHistoryCandle[]; message?: string };
        if (json.s !== 'ok' || !Array.isArray(json.candles) || json.candles.length === 0) {
          MarketService.noteFyersHttpFailure(res.status, json.message, json.code);
          console.warn(`[Overnight] Fyers 5m empty for ${fyersSymbol}: ${json.message ?? json.s}`);
          return null;
        }
        return parseStockIntradayMetricsFromFyersCandles(json.candles, currentTime);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn(
        `[Overnight] Fyers 5m fetch error for ${stock.symbol}:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  private static generateDeterministicMock5mCandles(
    symbol: string,
    date: Date,
    stockPrice: number,
    stockVolume: number
  ): { price: number; volume: number; high: number; low: number; close: number }[] {
    const candles: { price: number; volume: number; high: number; low: number; close: number }[] = [];
    
    let seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    seed += date.getDate() + date.getMonth() + date.getFullYear();

    const seededRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    let currentPrice = stockPrice * 0.98;
    const averageVolumePerCandle = stockVolume / 73;

    for (let i = 0; i < 73; i++) {
      const priceChangePct = (seededRandom() - 0.48) * 0.002;
      const open = currentPrice;
      const close = currentPrice * (1 + priceChangePct);
      const high = Math.max(open, close) * (1 + seededRandom() * 0.001);
      const low = Math.min(open, close) * (1 - seededRandom() * 0.001);
      const volume = Math.floor(averageVolumePerCandle * (0.5 + seededRandom()));

      candles.push({
        price: (high + low + close) / 3,
        volume,
        high,
        low,
        close
      });

      currentPrice = close;
    }

    return candles;
  }

  /**
   * Main scan task to discover Overnight setups.
   */
  static async discover(
    direction: 'LONG' | 'SHORT' | 'BOTH' = 'BOTH', 
    dateOverride?: Date,
    mockStocks?: MockOvernightStock[]
  ): Promise<(OvernightSignal & {
    scoreBreakdown?: import('./btst-ranking.service').AdvancedScoreBreakdown | null;
    vpaBreakdown?: VpaConfirmationResult | null;
  })[]> {

    const currentTime = dateOverride || new Date();
    
    const dateStr = DATE_FORMATTER.format(currentTime); // "YYYY-MM-DD"
    const timeStr = TIME_FORMATTER.format(currentTime); // "HH:MM"

    const state = this.determineState(currentTime);
    const regime = await RegimeService.getMarketRegime(dateStr);
    
    const universeStocks = mockStocks 
      ? mockStocks.map(s => ({ symbol: s.symbol })) 
      : MarketService.getUniverse('NSE_FNO');
    const signalsToSave: Prisma.OvernightSignalCreateInput[] = [];
    const scoreBreakdownBySymbol = new Map<
      string,
      import('./btst-ranking.service').AdvancedScoreBreakdown
    >();
    const vpaBreakdownBySymbol = new Map<string, VpaConfirmationResult>();

    // Pre-fetch async dependencies for the entire universe to prevent N+1 query bottlenecks
    const symbols = universeStocks.map(s => s.symbol);
    const bulkEventRisks = await EventCalendarService.getBulkEventRisk(symbols, dateStr);
    const macroEventRisk = await EventCalendarService.getMacroEventRisk(dateStr);

    // Batch-fetch market data (the expensive Yahoo path on cache miss). Mock
    // overrides still come from mockStocks below; live path uses this map.
    const stockDataBySymbol = new Map<string, MarketStockData | null>();
    if (!mockStocks) {
      // Seed Fyers LTP quotes in ≤50/request batches before per-symbol history.
      await MarketService.prefetchFyersQuotes(symbols, 'NSE');
      for (let i = 0; i < symbols.length; i += STOCK_DATA_PREFETCH_CHUNK) {
        const chunk = symbols.slice(i, i + STOCK_DATA_PREFETCH_CHUNK);
        const settled = await Promise.allSettled(
          chunk.map((symbol) => MarketService.getStockData(symbol))
        );
        settled.forEach((result, idx) => {
          const symbol = chunk[idx];
          if (result.status === 'fulfilled') {
            stockDataBySymbol.set(symbol, result.value);
          } else {
            console.error(
              `Error pre-fetching stock data for Overnight scan ${symbol}:`,
              result.reason
            );
            stockDataBySymbol.set(symbol, null);
          }
        });
      }
    }

    // H-7: Pre-fetch all intraday 5m data in parallel batches before the scoring loop.
    // Previously this was awaited sequentially inside the loop — 200 HTTP requests
    // at ~200-500 ms each = 40-100 s of stall, routinely missing the BTST window.
    // Chunked at STOCK_DATA_PREFETCH_CHUNK to avoid Yahoo rate-limit bans.
    const intradayBySymbol = new Map<string, OvernightIntradayMetrics>();
    {
      const stocksForIntraday = mockStocks
        ? mockStocks.map(s => s as MarketStockData)
        : ([...stockDataBySymbol.entries()]
            .filter(([, v]) => v !== null)
            .map(([, v]) => v as MarketStockData));

      for (let i = 0; i < stocksForIntraday.length; i += STOCK_DATA_PREFETCH_CHUNK) {
        const chunk = stocksForIntraday.slice(i, i + STOCK_DATA_PREFETCH_CHUNK);
        const settled = await Promise.allSettled(
          chunk.map((stock) => OvernightService.getIntradayData(stock, currentTime))
        );
        settled.forEach((result, idx) => {
          const sym = chunk[idx]!.symbol;
          if (result.status === 'fulfilled') {
            intradayBySymbol.set(sym, result.value);
          } else {
            console.warn(
              `[Overnight] Intraday pre-fetch failed for ${sym} — will use no-intraday fallback:`,
              result.reason instanceof Error ? result.reason.message : result.reason
            );
            intradayBySymbol.set(sym, { vwap: null, intradayVolume: null, last15mHigh: null, last15mLow: null, hasIntraday: false });
          }
        });
      }
    }

    for (const stock of universeStocks) {
      try {
        const fullStock = mockStocks
          ? mockStocks.find(s => s.symbol === stock.symbol)
          : (stockDataBySymbol.get(stock.symbol) ?? null);
        if (!fullStock) continue;

        const history = fullStock.history || [];
        const stockReturn5d = history.length > RS_LOOKBACK
          ? safeRatio(
              history[history.length - 1].close - history[history.length - 1 - RS_LOOKBACK].close,
              history[history.length - 1 - RS_LOOKBACK].close,
              0
            ) * 100
          : 0;
        const relativeStrength = stockReturn5d - (regime.niftyReturn5d ?? 0);

        if (history.length === 0) {
          console.warn(`[OvernightScan] ${fullStock.symbol} skipped: Empty market history (cannot establish distinct prior day candle).`);
          continue;
        }

        const lastCandle = history[history.length - 1];
        const isLastToday = lastCandle.date === dateStr;
        const { isTradingDay } = getISTTime(currentTime);

        // Trading day without today's daily bar: do not synthesize todayCandle from
        // prior-session H/L + LTP (false tomorrow CPR width / Narrow +30).
        if (!isLastToday && isTradingDay) {
          console.warn(
            `[OvernightScan] ${fullStock.symbol} skipped: Today's daily candle unavailable.`
          );
          continue;
        }

        const isTodayCandleFinal = dateOverride 
          ? isLastToday 
          : (isLastToday && isTodayCandleClosed());

        // Ensure we have distinct candles for both today's candle and yesterday's (prior day) candle.
        // When history already contains today's (possibly in-progress) bar, yesterday must be
        // history[n-2] — never the same candle as today — regardless of whether today is final.
        if (isLastToday && history.length < 2) {
          console.warn(`[OvernightScan] ${fullStock.symbol} skipped: Insufficient history length ${history.length} for today-appended database state (requires at least 2 distinct daily candles).`);
          continue;
        }

        if (history.length < LIQUIDITY.MIN_HISTORY_FOR_RELIABLE_ATR) {
          console.warn(`[OvernightScan] ${fullStock.symbol} skipped: Insufficient history length ${history.length} < MIN_HISTORY_FOR_RELIABLE_ATR (${LIQUIDITY.MIN_HISTORY_FOR_RELIABLE_ATR}).`);
          continue;
        }

        const todayCandle = isLastToday
          ? (isTodayCandleFinal ? lastCandle : { high: fullStock.high, low: fullStock.low, close: fullStock.ltp })
          : lastCandle;

        // M-3 fix: replace silent fallback (yesterdayCandle = lastCandle when only 1 bar)
        // with an explicit skip. The fallback caused todayCpr === yesterdayCpr silently,
        // making the Higher Value rule always false and producing misleading BTST signals.
        // Note: the history.length >= 2 invariant is also checked above at line 438,
        // but only when isLastToday is true. This guard covers the non-today case.
        if (history.length < 2) {
          console.warn(`[OvernightScan] ${fullStock.symbol} skipped: only 1 bar in history, cannot derive yesterdayCandle.`);
          continue;
        }

        const yesterdayCandle = history[history.length - 2];


        // Same completed-history ATR input as signal.service / Simple BtstService
        // (exclude in-progress today bar; ref close = last completed close).
        const completedHistory = getCompletedHistory(history, dateOverride ? dateStr : undefined);
        const atrPct = getAtrPct(
          completedHistory.length ? completedHistory : history,
          completedHistory.length
            ? completedHistory[completedHistory.length - 1].close
            : fullStock.close
        );

        const todayCpr = calculateCPR({
          high: yesterdayCandle.high,
          low: yesterdayCandle.low,
          close: yesterdayCandle.close,
        }, atrPct);

        const tomorrowCpr = calculateCPR({
          high: todayCandle.high,
          low: todayCandle.low,
          close: todayCandle.close,
        }, atrPct);
        // Read from the pre-fetched map — no HTTP call here.
        const intraday = intradayBySymbol.get(fullStock.symbol)
          ?? { vwap: null, intradayVolume: null, last15mHigh: null, last15mLow: null, hasIntraday: false };

        const mockStock = fullStock as MockOvernightStock;

        // Hard liquidity gate (avgVolume < 100k / volumeRatio < 1.5 VDU / etc.):
        // ineligible stocks never become signals — not even LOW_QUALITY.
        // LOW_QUALITY later is only for weaker tiers that already passed this gate.
        const elig = EntryManagerService.evaluateEligibility(fullStock, intraday.vwap, intraday.intradayVolume, intraday.hasIntraday);
        if (!elig.eligible) {
          continue;
        }

        // Compute RSI and EMA Cross ONCE per stock for shadow scoring
        const rsi14 = calculateRSI(completedHistory);
        const emaCross = detectEmaCross(completedHistory);

        // -- Evaluate LONG --
        let longSig: OvernightSignalCalc | null = null;
        if (direction === 'LONG' || direction === 'BOTH') {
          const details = mockStock.longScoreOverride !== undefined
            ? { score: mockStock.longScoreOverride, breakdown: null as import('./btst-ranking.service').AdvancedScoreBreakdown | null }
            : BtstRankingService.calculateScoreDetails({
                volume: fullStock.volume, avgVolume: fullStock.avgVolume,
                open: fullStock.open,
                tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
                tomorrowBc: tomorrowCpr.bc, tomorrowTc: tomorrowCpr.tc,
                todayBc: todayCpr.bc, todayTc: todayCpr.tc,
                close: fullStock.ltp, high: fullStock.high, low: fullStock.low,
                vwap: intraday.vwap, intradayVolume: intraday.intradayVolume, last15mHigh: intraday.last15mHigh,
                hasConfirmationCandles: intraday.hasIntraday,
                rsi14, emaCross
              });
          const score = details.score;
          const cls = BtstRankingService.getClassification(score);
          const sl = Math.min(fullStock.low, tomorrowCpr.bc);
          const target = fullStock.ltp + Math.max((fullStock.ltp - sl) * 2.5, fullStock.ltp * 0.05);
          longSig = { score, cls, sl, target, scoreBreakdown: details.breakdown, vpaBreakdown: details.vpa ?? null };
        }

        // -- Evaluate SHORT (always scored for conflict/quality; persisted only outside BULL) --
        let shortSig: OvernightSignalCalc | null = null;
        if (direction === 'SHORT' || direction === 'BOTH') {
          const details = mockStock.shortScoreOverride !== undefined
            ? { score: mockStock.shortScoreOverride, breakdown: null as import('./btst-ranking.service').AdvancedScoreBreakdown | null }
            : StbtRankingService.calculateScoreDetails({
                volume: fullStock.volume, avgVolume: fullStock.avgVolume,
                open: fullStock.open,
                tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
                tomorrowTc: tomorrowCpr.tc, tomorrowBc: tomorrowCpr.bc,
                todayBc: todayCpr.bc, todayTc: todayCpr.tc,
                close: fullStock.ltp, high: fullStock.high, low: fullStock.low,
                vwap: intraday.vwap, intradayVolume: intraday.intradayVolume, last15mLow: intraday.last15mLow,
                hasConfirmationCandles: intraday.hasIntraday,
                rsi14, emaCross
              });
          const score = details.score;
          const cls = StbtRankingService.getClassification(score);
          const sl = Math.max(fullStock.high, tomorrowCpr.tc);
          const target = fullStock.ltp - Math.max((sl - fullStock.ltp) * 2.5, fullStock.ltp * 0.05);
          shortSig = { score, cls, sl, target, scoreBreakdown: details.breakdown, vpaBreakdown: details.vpa ?? null };
        }

        // -- Conflict Resolution (null scores are ineligible — never coerced to 0) --
        const conflict = resolveOvernightConflict(longSig, shortSig);
        const finalDir = conflict.finalDir;
        const finalSig = conflict.finalSig as OvernightSignalCalc | null;
        let finalCls = conflict.finalCls;

        if (finalCls === 'NEUTRAL_CONFLICT' && longSig && shortSig) {
          const diff = Math.abs((longSig.score as number) - (shortSig.score as number));
          console.warn(`[OvernightScan] ${fullStock.symbol}: NEUTRAL_CONFLICT. LongScore=${longSig.score}, ShortScore=${shortSig.score}, Diff=${diff}, Time=${dateStr} ${timeStr}`);
        }

        if (finalDir && finalSig) {
          // Optional VPA hard gate — off by default (VPA_LIVE_GATES=false).
          if (isVpaLiveGatesEnabled() && finalSig.vpaBreakdown?.rejectRecommended) {
            console.warn(
              `[OvernightScan] ${fullStock.symbol} ${finalDir} VPA gate: ${finalSig.vpaBreakdown.rejectReason}`
            );
            continue;
          }

          // Hard block regime-misaligned overnight directions (mirrors journal/alert suppression).
          if (finalDir === 'SHORT' && regime.trend === 'BULL') {
            continue;
          }
          if (finalDir === 'LONG' && regime.trend === 'BEAR') {
            continue;
          }

          const ext = EntryManagerService.evaluateExtension(fullStock, finalDir);
          if (!ext.eligible) {
            console.warn(`[OvernightScan] ${fullStock.symbol} ${finalDir} skipped: ${ext.reason}`);
            continue;
          }

          const gapMetrics = GapProbabilityService.calculateGapProbability(fullStock, finalDir);
          const conf = gapMetrics ? gapMetrics.gapConfidence : 50;
          const expGap = gapMetrics ? gapMetrics.expectedGap : 0;
          
          if (finalCls !== 'NEUTRAL_CONFLICT') {
            finalCls = finalSig.cls;
          }

          if (finalCls === 'IGNORE' && env.SAVE_IGNORE_SIGNALS !== 'true') {
            continue;
          }

          const quality = SignalQualityService.evaluateSignal(
            fullStock,
            finalDir,
            longSig?.score || 0,
            shortSig?.score || 0,
            regime,
            history.length,
            bulkEventRisks[fullStock.symbol] || { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' },
            macroEventRisk,
            relativeStrength
          );

          if (quality.qualityBucket === 'LOW_QUALITY') {
             console.log(`[OvernightScan] ${fullStock.symbol} flagged as LOW_QUALITY (Liquidity: ${quality.liquidityQuality}, Regime: ${quality.regimeFit}).`);
          }

          signalsToSave.push({
            symbol: stock.symbol,
            signalDate: dateStr,
            signalTime: timeStr,
            direction: finalDir,
            entry: fullStock.ltp,
            stopLoss: finalSig.sl,
            target: finalSig.target,
            overnightScore: finalSig.score,
            expectedGap: expGap,
            expectedMove: expGap * 2.0,
            confidence: conf,
            exitStrategy: 'EOD',
            actualExit: null,
            actualReturn: null,
            executed: false,
            classification: finalCls,
            freezeTime: state === 'FROZEN' ? new Date() : null,
            rejectionReason: null,
            historyQuality: quality.historyQuality,
            liquidityQuality: quality.liquidityQuality,
            eventRisk: quality.eventRisk,
            regimeFit: quality.regimeFit,
            conflictConfidence: quality.conflictConfidence,
            qualityModelVersion: quality.qualityModelVersion,
            qualityBucket: quality.qualityBucket,
            eventRiskReason: quality.eventRiskReason,
            relativeStrength: quality.relativeStrength,
            regimeSnapshot: JSON.stringify(regime),
          });
          if (finalSig.scoreBreakdown) {
            scoreBreakdownBySymbol.set(stock.symbol, finalSig.scoreBreakdown);
          }
          if (finalSig.vpaBreakdown?.enabled) {
            vpaBreakdownBySymbol.set(stock.symbol, finalSig.vpaBreakdown);
          }
        }
      } catch (err) {
        console.error(`Error processing Overnight scan for ${stock.symbol}:`, err);
      }
    }

    // H3 fix: sort by unique key (symbol, then direction) BEFORE the transaction
    // so concurrent workers acquire row locks in the same order. Symbol-only sort
    // left LONG vs SHORT of the same ticker unordered (stable sort keeps insert
    // order) and could still deadlock. UI score sort is re-applied below.
    signalsToSave.sort((a, b) => {
      const sym = (a.symbol as string).localeCompare(b.symbol as string);
      if (sym !== 0) return sym;
      return String(a.direction ?? '').localeCompare(String(b.direction ?? ''));
    });

    // H-6: Batch all upserts into a single interactive transaction instead of
    // 200 sequential await prisma.overnightSignal.upsert() calls (~1 s of DB I/O).
    const savedSignals: (OvernightSignal & {
      scoreBreakdown?: import('./btst-ranking.service').AdvancedScoreBreakdown | null;
      vpaBreakdown?: VpaConfirmationResult | null;
    })[] = [];
    try {
      const results = await prisma.$transaction(
        signalsToSave.map((sig) =>
          prisma.overnightSignal.upsert({
            where: {
              symbol_signalDate_signalTime_direction: {
                symbol: sig.symbol,
                signalDate: sig.signalDate,
                signalTime: sig.signalTime,
                direction: sig.direction!
              }
            },
            update: sig,
            create: sig
          })
        )
      );
      for (const saved of results) {
        const breakdown = scoreBreakdownBySymbol.get(saved.symbol);
        const vpa = vpaBreakdownBySymbol.get(saved.symbol);
        savedSignals.push({
          ...saved,
          ...(breakdown ? { scoreBreakdown: breakdown } : {}),
          ...(vpa ? { vpaBreakdown: vpa } : {}),
        });
      }
    } catch (err) {
      console.error('[Overnight] Batch upsert transaction failed — signals not saved:', err);
      // Re-throw so the caller (API route) receives a 500 and does NOT cache
      // an empty [] result for 9 hours, which would show "0 setups found"
      // to all users until the cache expires at midnight.
      throw new Error('Overnight scan persistence failed — database transaction aborted');
    }

    // Re-sort for UI: IGNORE last, then by descending score.
    // (Transaction payload was sorted by symbol for lock-order safety above.)
    savedSignals.sort((a, b) => {
      if (a.classification === 'IGNORE' && b.classification !== 'IGNORE') return 1;
      if (a.classification !== 'IGNORE' && b.classification === 'IGNORE') return -1;
      return (b.overnightScore || 0) - (a.overnightScore || 0);
    });

    return savedSignals;
  }
}
