import { env } from '@/config/env';
/**
 * ADVANCED ENGINE — authoritative for live UI (/api/btst adapter), Telegram
 * (btst-alert), Trade Journal (btst-journal), and /api/overnight. Max score 130.
 * Simple Engine (BtstService) remains for backtests and V2 shadow scoring only.
 */
import { OvernightSignal, Prisma } from '@prisma/client';
import { VOLUME_THRESHOLDS, CPR_THRESHOLDS, ATR, BTST_SCORING, LIQUIDITY } from '@/config/trading-constants';
import { prisma } from '@/lib/db';
import { calculateCPR, isCprVirgin } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { MarketService, MarketStockData } from '../market.service';
import { BtstRankingService } from './btst-ranking.service';
import { StbtRankingService } from './stbt-ranking.service';
import { GapProbabilityService } from './gap-probability.service';
import { EntryManagerService } from './entry-manager.service';
import { getISTTime, isTodayCandleClosed, getBtstWindowState } from '@/lib/market-hours';
import { EventCalendarService } from './event.service';
import { RegimeService, RS_LOOKBACK } from './regime.service';
import { SignalQualityService } from './signal-quality.service';

const MIN_HISTORY_FOR_RELIABLE_ATR = 15; // Minimum daily candles for stable ATR computation

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


interface YahooFinanceChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
      };
    }>;
  };
}

interface OvernightSignalCalc {
  score: number | null;
  cls: string;
  sl: number;
  target: number;
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
   * Helper to determine signal state based on canonical BTST_WINDOWS.
   * DISCOVERING = 15:10–15:20, ACTIVE = 15:20–15:25, else FROZEN.
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
   * Fetches/simulates intraday 5m candle data to compute VWAP and 15m high/low.
   */
  static async getIntradayData(stock: MarketStockData, currentTime: Date): Promise<OvernightIntradayMetrics> {
    const mode = env.HISTORICAL_MODE || 'mock';

    if (mode === 'live') {
      const symbol = stock.symbol;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?interval=5m&range=1d`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`Live fetch HTTP ${response.status}`);

        const json = await response.json() as YahooFinanceChartResponse;
        const result = json?.chart?.result?.[0];
        if (!result || !result.timestamp) throw new Error('Live fetch returned empty data');

        const timestamps = result.timestamp;
        const quotes = result.indicators?.quote?.[0];
        if (!quotes) throw new Error('Live fetch returned empty data');

        if (!quotes.high || !quotes.low || !quotes.close || !quotes.volume || 
            quotes.high.length !== timestamps.length || 
            quotes.low.length !== timestamps.length || 
            quotes.close.length !== timestamps.length || 
            quotes.volume.length !== timestamps.length) {
          throw new Error('Live fetch returned misaligned quote arrays');
        }

        let sumPriceVol = 0;
        let sumVol = 0;
        let last15mHigh = 0;
        let last15mLow = Infinity;
        let hasIntraday = false;

        const currentTimestampSec = Math.floor(currentTime.getTime() / 1000);

        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] <= currentTimestampSec) {
            const high = quotes.high[i];
            const low = quotes.low[i];
            const close = quotes.close[i];
            const volume = quotes.volume[i] || 0;

            if (high != null && low != null && close != null) {
              const typicalPrice = (high + low + close) / 3;
              sumPriceVol += typicalPrice * volume;
              sumVol += volume;
              hasIntraday = true;
            }
          }
        }

        let count = 0;
        let maxHigh = 0;
        let minLow = Infinity;
        let skippedCurrent = false;
        // Exclude the current/forming 5m candle, then take the prior three completed
        // candles as the "last 15m" range. Including the current bar makes
        // close > last15mHigh / close < last15mLow nearly impossible.
        for (let i = timestamps.length - 1; i >= 0; i--) {
          if (timestamps[i] <= currentTimestampSec) {
            if (!skippedCurrent) {
              skippedCurrent = true;
              continue;
            }
            const high = quotes.high[i];
            const low = quotes.low[i];
            if (high != null && low != null) {
              maxHigh = Math.max(maxHigh, high);
              minLow = Math.min(minLow, low);
              count++;
              if (count === 3) break;
            }
          }
        }
        last15mHigh = maxHigh;
        last15mLow = minLow !== Infinity ? minLow : 0;

        const vwap = sumVol > 0 ? sumPriceVol / sumVol : null;

        return {
          vwap,
          intradayVolume: sumVol > 0 ? sumVol : null,
          last15mHigh: last15mHigh > 0 ? last15mHigh : null,
          last15mLow: last15mLow > 0 ? last15mLow : null,
          hasIntraday
        };

      } catch {
        return { vwap: null, intradayVolume: null, last15mHigh: null, last15mLow: null, hasIntraday: false };
      }
    } else {
      const { totalMinutes } = OvernightService.getISTTime(currentTime);

      const startMinutes = 9 * 60 + 15;
      let elapsedCandles = Math.floor((totalMinutes - startMinutes) / 5);
      if (elapsedCandles < 0) elapsedCandles = 0;
      if (elapsedCandles > 73) elapsedCandles = 73;

      const allCandles = this.generateDeterministicMock5mCandles(stock.symbol, currentTime, stock.ltp, stock.volume);

      let sumPriceVol = 0;
      let sumVol = 0;
      let maxHigh = 0;
      let minLow = Infinity;

      const activeCandles = allCandles.slice(0, elapsedCandles + 1);

      for (const candle of activeCandles) {
        sumPriceVol += candle.price * candle.volume;
        sumVol += candle.volume;
      }

      const last3 = activeCandles.length > 1
        ? activeCandles.slice(0, -1).slice(-3) // exclude current forming candle
        : [];
      for (const c of last3) {
        maxHigh = Math.max(maxHigh, c.high);
        minLow = Math.min(minLow, c.low);
      }

      return {
        vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
        intradayVolume: sumVol > 0 ? sumVol : null,
        last15mHigh: maxHigh > 0 ? maxHigh : null,
        last15mLow: minLow !== Infinity ? minLow : null,
        hasIntraday: activeCandles.length > 0
      };
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
  ): Promise<OvernightSignal[]> {

    const currentTime = dateOverride || new Date();
    
    const dateStr = DATE_FORMATTER.format(currentTime); // "YYYY-MM-DD"
    const timeStr = TIME_FORMATTER.format(currentTime); // "HH:MM"

    const state = this.determineState(currentTime);
    const regime = await RegimeService.getMarketRegime(dateStr);
    
    const universeStocks = mockStocks 
      ? mockStocks.map(s => ({ symbol: s.symbol })) 
      : MarketService.getUniverse('NSE_FNO');
    const signalsToSave: Prisma.OvernightSignalCreateInput[] = [];

    // Pre-fetch async dependencies for the entire universe to prevent N+1 query bottlenecks
    const symbols = universeStocks.map(s => s.symbol);
    const bulkEventRisks = await EventCalendarService.getBulkEventRisk(symbols, dateStr);
    const macroEventRisk = await EventCalendarService.getMacroEventRisk(dateStr);

    for (const stock of universeStocks) {
      try {
        const fullStock = mockStocks
          ? mockStocks.find(s => s.symbol === stock.symbol)
          : await MarketService.getStockData(stock.symbol);
        if (!fullStock) continue;

        const history = fullStock.history || [];
        const stockReturn5d = history.length > RS_LOOKBACK
          ? ((history[history.length - 1].close - history[history.length - 1 - RS_LOOKBACK].close) /
             history[history.length - 1 - RS_LOOKBACK].close) * 100
          : 0;
        const relativeStrength = stockReturn5d - (regime.niftyReturn5d ?? 0);

        if (history.length === 0) {
          console.warn(`[OvernightScan] ${fullStock.symbol} skipped: Empty market history (cannot establish distinct prior day candle).`);
          continue;
        }

        const lastCandle = history[history.length - 1];
        const isLastToday = lastCandle.date === dateStr;
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

        if (history.length < MIN_HISTORY_FOR_RELIABLE_ATR) {
          console.warn(`[OvernightScan] ${fullStock.symbol} skipped: Insufficient history length ${history.length} < MIN_HISTORY_FOR_RELIABLE_ATR (${MIN_HISTORY_FOR_RELIABLE_ATR}).`);
          continue;
        }

        const todayCandle = isTodayCandleFinal
          ? lastCandle
          : { high: fullStock.high, low: fullStock.low, close: fullStock.ltp };

        const yesterdayCandle = isLastToday
          ? history[history.length - 2]
          : lastCandle;

        const atrPct = getAtrPct(
          isLastToday && !isTodayCandleFinal ? history.slice(0, -1) : history,
          isLastToday && !isTodayCandleFinal && history.length >= 2
            ? history[history.length - 2].close
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
        const intraday = await this.getIntradayData(fullStock, currentTime);

        const mockStock = fullStock as MockOvernightStock;

        const elig = EntryManagerService.evaluateEligibility(fullStock, intraday.vwap, intraday.intradayVolume, intraday.hasIntraday);
        if (!elig.eligible) {
          continue;
        }

        // -- Evaluate LONG --
        let longSig: OvernightSignalCalc | null = null;
        if (direction === 'LONG' || direction === 'BOTH') {
          const score = mockStock.longScoreOverride !== undefined
            ? mockStock.longScoreOverride
            : BtstRankingService.calculateScore({
                volume: fullStock.volume, avgVolume: fullStock.avgVolume,
                tomorrowCprWidth: tomorrowCpr.width,
                tomorrowBc: tomorrowCpr.bc, tomorrowTc: tomorrowCpr.tc,
                todayBc: todayCpr.bc, todayTc: todayCpr.tc,
                close: fullStock.ltp, high: fullStock.high, low: fullStock.low,
                vwap: intraday.vwap, intradayVolume: intraday.intradayVolume, last15mHigh: intraday.last15mHigh,
                hasConfirmationCandles: intraday.hasIntraday
              });
          const cls = BtstRankingService.getClassification(score);
          const sl = Math.min(fullStock.low, tomorrowCpr.bc);
          const target = fullStock.ltp + Math.max((fullStock.ltp - sl) * 2.5, fullStock.ltp * 0.05);
          longSig = { score, cls, sl, target };
        }

        // -- Evaluate SHORT --
        let shortSig: OvernightSignalCalc | null = null;
        if (direction === 'SHORT' || direction === 'BOTH') {
          const score = mockStock.shortScoreOverride !== undefined
            ? mockStock.shortScoreOverride
            : StbtRankingService.calculateScore({
                volume: fullStock.volume, avgVolume: fullStock.avgVolume,
                tomorrowCprWidth: tomorrowCpr.width,
                tomorrowTc: tomorrowCpr.tc, tomorrowBc: tomorrowCpr.bc,
                todayBc: todayCpr.bc, todayTc: todayCpr.tc,
                close: fullStock.ltp, high: fullStock.high, low: fullStock.low,
                vwap: intraday.vwap, intradayVolume: intraday.intradayVolume, last15mLow: intraday.last15mLow,
                hasConfirmationCandles: intraday.hasIntraday
              });
          const cls = StbtRankingService.getClassification(score);
          const sl = Math.max(fullStock.high, tomorrowCpr.tc);
          const target = fullStock.ltp - Math.max((sl - fullStock.ltp) * 2.5, fullStock.ltp * 0.05);
          shortSig = { score, cls, sl, target };
        }

        // -- Conflict Resolution --
        let finalDir: 'LONG' | 'SHORT' | null = null;
        let finalSig: OvernightSignalCalc | null = null;
        let finalCls = 'IGNORE';

        if (longSig && shortSig) {
          const diff = Math.abs((longSig.score || 0) - (shortSig.score || 0));
          if ((longSig.score || 0) >= (shortSig.score || 0)) { finalDir = 'LONG'; finalSig = longSig; }
          else { finalDir = 'SHORT'; finalSig = shortSig; }
          
          if (diff < 10) {
            console.warn(`[OvernightScan] ${fullStock.symbol}: NEUTRAL_CONFLICT. LongScore=${longSig.score}, ShortScore=${shortSig.score}, Diff=${diff}, Time=${dateStr} ${timeStr}`);
            finalCls = 'NEUTRAL_CONFLICT';
          }
        } else if (longSig) {
          finalDir = 'LONG'; finalSig = longSig;
        } else if (shortSig) {
          finalDir = 'SHORT'; finalSig = shortSig;
        }

        if (finalDir && finalSig) {
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
            bulkEventRisks[fullStock.symbol] || { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'UNKNOWN' },
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
        }
      } catch (err) {
        console.error(`Error processing Overnight scan for ${stock.symbol}:`, err);
      }
    }

    signalsToSave.sort((a, b) => {
      if (a.classification === 'IGNORE' && b.classification !== 'IGNORE') return 1;
      if (a.classification !== 'IGNORE' && b.classification === 'IGNORE') return -1;
      return (b.overnightScore || 0) - (a.overnightScore || 0);
    });

    const savedSignals = [];
    for (const sig of signalsToSave) {
      try {
        const saved = await prisma.overnightSignal.upsert({
          where: {
            symbol_signalDate_signalTime: {
              symbol: sig.symbol,
              signalDate: sig.signalDate,
              signalTime: sig.signalTime
            }
          },
          update: sig,
          create: sig
        });
        savedSignals.push(saved);
      } catch (err) {
        console.error(`Error saving overnight signal for ${sig.symbol}:`, err);
      }
    }

    return savedSignals;
  }
}
