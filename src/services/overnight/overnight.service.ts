// ADVANCED ENGINE: Used by /api/overnight (NSE FNO)
// Max score 130, eligibility gates, DB persistence
import { PrismaClient, OvernightSignal, Prisma } from '@prisma/client';
import { calculateCPR } from '@/lib/cpr-engine';
import { MarketService, MarketStockData } from '../market.service';
import { BtstRankingService } from './btst-ranking.service';
import { StbtRankingService } from './stbt-ranking.service';
import { GapProbabilityService } from './gap-probability.service';
import { EntryManagerService } from './entry-manager.service';

const prisma = new PrismaClient();


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
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(date);
    const hour = parseInt(
      parts.find(p => p.type === 'hour')?.value || '0', 10
    );
    const minute = parseInt(
      parts.find(p => p.type === 'minute')?.value || '0', 10
    );
    return { hour, minute, totalMinutes: hour * 60 + minute };
  }

  /**
   * Helper to determine signal state based on time.
   */
  static determineState(time: Date): 'DISCOVERING' | 'ACTIVE' | 'FROZEN' {
    const { hour: hours, minute: minutes, totalMinutes } = this.getISTTime(time);

    const startMinutes = 15 * 60 + 15; // 3:15 PM
    const activeMinutes = 15 * 60 + 20; // 3:20 PM
    const freezeMinutes = 15 * 60 + 25; // 3:25 PM

    if (totalMinutes < startMinutes) {
      return 'DISCOVERING';
    } else if (totalMinutes >= startMinutes && totalMinutes < activeMinutes) {
      return 'DISCOVERING';
    } else if (totalMinutes >= activeMinutes && totalMinutes < freezeMinutes) {
      return 'ACTIVE';
    } else {
      return 'FROZEN';
    }
  }

  /**
   * Fetches/simulates intraday 5m candle data to compute VWAP and 15m high/low.
   */
  static async getIntradayData(stock: MarketStockData, currentTime: Date): Promise<OvernightIntradayMetrics> {
    const mode = process.env.HISTORICAL_MODE || 'mock';

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

            if (high !== null && low !== null && close !== null) {
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
        for (let i = timestamps.length - 1; i >= 0; i--) {
          if (timestamps[i] <= currentTimestampSec) {
            const high = quotes.high[i];
            const low = quotes.low[i];
            if (high !== null && low !== null) {
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

      } catch (_err) {
        return { vwap: null, intradayVolume: null, last15mHigh: null, last15mLow: null, hasIntraday: false };
      }
    } else {
      const { hour: hours, minute: minutes, totalMinutes } = OvernightService.getISTTime(currentTime);

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

      const last3 = activeCandles.slice(-3);
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
    mockStocks?: any[]
  ): Promise<OvernightSignal[]> {
    const currentTime = dateOverride || new Date();
    
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const dateStr = dateFormatter.format(currentTime); // "YYYY-MM-DD"
    
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    const timeStr = timeFormatter.format(currentTime); // "HH:MM"

    const state = this.determineState(currentTime);
    const universeStocks = mockStocks 
      ? mockStocks.map(s => ({ symbol: s.symbol })) 
      : MarketService.getUniverse('NSE_FNO');
    const signalsToSave: Prisma.OvernightSignalCreateInput[] = [];

    for (const stock of universeStocks) {
      try {
        const fullStock = mockStocks
          ? mockStocks.find(s => s.symbol === stock.symbol)
          : await MarketService.getStockData(stock.symbol);
        if (!fullStock) continue;

        const todayCpr = calculateCPR({ high: fullStock.high, low: fullStock.low, close: fullStock.close });
        const tomorrowCpr = calculateCPR({ high: fullStock.high, low: fullStock.low, close: fullStock.ltp });
        const intraday = await this.getIntradayData(fullStock, currentTime);

        // -- Evaluate LONG --
        let longSig: OvernightSignalCalc | null = null;
        if (direction === 'LONG' || direction === 'BOTH') {
          const elig = EntryManagerService.evaluateEligibility('LONG', fullStock, tomorrowCpr, todayCpr, intraday.vwap, intraday.intradayVolume, intraday.hasIntraday);
          if (elig.eligible) {
            const score = (fullStock as any).longScoreOverride !== undefined
              ? (fullStock as any).longScoreOverride
              : BtstRankingService.calculateScore({
                  volume: fullStock.volume, avgVolume: fullStock.avgVolume,
                  tomorrowCprWidth: tomorrowCpr.width, tomorrowBc: tomorrowCpr.bc, todayTc: todayCpr.tc,
                  close: fullStock.ltp, high: fullStock.high, low: fullStock.low,
                  vwap: intraday.vwap, intradayVolume: intraday.intradayVolume, last15mHigh: intraday.last15mHigh,
                  hasConfirmationCandles: intraday.hasIntraday
                });
            const cls = BtstRankingService.getClassification(score);
            const sl = Math.min(fullStock.low, tomorrowCpr.bc);
            const target = fullStock.ltp + Math.max((fullStock.ltp - sl) * 2.5, fullStock.ltp * 0.05);
            longSig = { score, cls, sl, target };
          }
        }

        // -- Evaluate SHORT --
        let shortSig: OvernightSignalCalc | null = null;
        if (direction === 'SHORT' || direction === 'BOTH') {
          const elig = EntryManagerService.evaluateEligibility('SHORT', fullStock, tomorrowCpr, todayCpr, intraday.vwap, intraday.intradayVolume, intraday.hasIntraday);
          if (elig.eligible) {
            const score = (fullStock as any).shortScoreOverride !== undefined
              ? (fullStock as any).shortScoreOverride
              : StbtRankingService.calculateScore({
                  volume: fullStock.volume, avgVolume: fullStock.avgVolume,
                  tomorrowCprWidth: tomorrowCpr.width, tomorrowTc: tomorrowCpr.tc, todayBc: todayCpr.bc,
                  close: fullStock.ltp, high: fullStock.high, low: fullStock.low,
                  vwap: intraday.vwap, intradayVolume: intraday.intradayVolume, last15mLow: intraday.last15mLow,
                  hasConfirmationCandles: intraday.hasIntraday
                });
            const cls = StbtRankingService.getClassification(score);
            const sl = Math.max(fullStock.high, tomorrowCpr.tc);
            const target = fullStock.ltp - Math.max((sl - fullStock.ltp) * 2.5, fullStock.ltp * 0.05);
            shortSig = { score, cls, sl, target };
          }
        }

        // -- Conflict Resolution --
        let finalDir: 'LONG' | 'SHORT' | null = null;
        let finalSig: OvernightSignalCalc | null = null;
        let finalCls = 'IGNORE';

        if (longSig && shortSig) {
          const diff = Math.abs((longSig.score || 0) - (shortSig.score || 0));
          if (diff < 10) {
            finalCls = 'NEUTRAL_CONFLICT';
            finalDir = 'LONG';
            finalSig = longSig;
          } else {
            if ((longSig.score || 0) > (shortSig.score || 0)) { finalDir = 'LONG'; finalSig = longSig; }
            else { finalDir = 'SHORT'; finalSig = shortSig; }
          }
        } else if (longSig) {
          finalDir = 'LONG'; finalSig = longSig;
        } else if (shortSig) {
          finalDir = 'SHORT'; finalSig = shortSig;
        }

        if (finalDir && finalSig) {
          const gapMetrics = GapProbabilityService.calculateGapProbability(fullStock, finalDir);
          const conf = gapMetrics ? gapMetrics.gapConfidence : 50;
          const expGap = gapMetrics ? gapMetrics.expectedGap : 0;
          
          if (finalCls === 'IGNORE') finalCls = finalSig.cls;

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
            rejectionReason: null
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
    }

    return savedSignals;
  }
}
