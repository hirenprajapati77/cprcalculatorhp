import { PrismaClient, BtstSignal, Prisma } from '@prisma/client';
import { calculateCPR } from '@/lib/cpr-engine';
import { MarketService, MarketStockData } from '../market.service';
import { BtstRankingService } from './btst-ranking.service';
import { OvernightRiskService } from './overnight-risk.service';
import { GapProbabilityService } from './gap-probability.service';
import { EntryManagerService } from './entry-manager.service';

const prisma = new PrismaClient();

export interface BtstIntradayMetrics {
  vwap: number | null;
  intradayVolume: number | null;
  last15mHigh: number | null;
  hasIntraday: boolean;
}

export class BtstService {
  /**
   * Helper to determine signal state based on time.
   */
  static determineState(time: Date): 'DISCOVERING' | 'ACTIVE' | 'FROZEN' {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const totalMinutes = hours * 60 + minutes;

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
   * Fetches/simulates intraday 5m candle data to compute VWAP and 15m high.
   */
  static async getIntradayData(stock: MarketStockData, currentTime: Date): Promise<BtstIntradayMetrics> {
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

        const json = await response.json() as {
          chart?: {
            result?: {
              timestamp?: number[];
              indicators?: {
                quote?: {
                  high: (number | null)[];
                  low: (number | null)[];
                  close: (number | null)[];
                  volume: (number | null)[];
                }[];
              };
            }[];
          };
        };
        const result = json?.chart?.result?.[0];
        if (!result || !result.timestamp) throw new Error('Live fetch returned empty data');

        const timestamps = result.timestamp;
        const quotes = result.indicators?.quote?.[0];
        if (!quotes) throw new Error('Live fetch returned empty data');

        let sumPriceVol = 0;
        let sumVol = 0;
        let last15mHigh = 0;
        let hasIntraday = false;

        const currentTimestampSec = Math.floor(currentTime.getTime() / 1000);

        for (let i = 0; i < timestamps.length; i++) {
          // Only process candles up to the current check time
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

        // Get last 15m High (last 3 candles of 5m)
        let count = 0;
        let maxHigh = 0;
        for (let i = timestamps.length - 1; i >= 0; i--) {
          if (timestamps[i] <= currentTimestampSec) {
            const high = quotes.high[i];
            if (high !== null) {
              maxHigh = Math.max(maxHigh, high);
              count++;
              if (count === 3) break;
            }
          }
        }
        last15mHigh = maxHigh;

        const vwap = sumVol > 0 ? sumPriceVol / sumVol : null;

        return {
          vwap,
          intradayVolume: sumVol > 0 ? sumVol : null,
          last15mHigh: last15mHigh > 0 ? last15mHigh : null,
          hasIntraday
        };

      } catch (err) {
        console.warn(`[BtstService] Failed to fetch live intraday for ${stock.symbol}:`, err);
        return { vwap: null, intradayVolume: null, last15mHigh: null, hasIntraday: false };
      }
    } else {
      // Mock / Paper mode: Generate deterministic 5m candles
      // A typical day has 75 candles, let's simulate up to index 73 (3:20 PM) or 74 (3:25 PM)
      const hours = currentTime.getHours();
      const minutes = currentTime.getMinutes();
      const totalMinutes = hours * 60 + minutes;

      // Calculate how many 5m candles have occurred since 9:15 AM
      const startMinutes = 9 * 60 + 15;
      let elapsedCandles = Math.floor((totalMinutes - startMinutes) / 5);
      if (elapsedCandles < 0) elapsedCandles = 0;
      if (elapsedCandles > 73) elapsedCandles = 73; // Freeze cap

      // Generate all 73 deterministic candles
      const allCandles = this.generateDeterministicMock5mCandles(stock.symbol, currentTime, stock.ltp, stock.volume);

      let sumPriceVol = 0;
      let sumVol = 0;
      let maxHigh = 0;

      const activeCandles = allCandles.slice(0, elapsedCandles + 1);

      for (const candle of activeCandles) {
        sumPriceVol += candle.price * candle.volume;
        sumVol += candle.volume;
      }

      // Last 15m high is max of last 3 candles
      const last3 = activeCandles.slice(-3);
      for (const c of last3) {
        maxHigh = Math.max(maxHigh, c.high);
      }

      return {
        vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
        intradayVolume: sumVol > 0 ? sumVol : null,
        last15mHigh: maxHigh > 0 ? maxHigh : null,
        hasIntraday: activeCandles.length > 0
      };
    }
  }

  /**
   * Deterministic 5m candles generator for mock mode.
   */
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

    let currentPrice = stockPrice * 0.98; // Start slightly lower
    const averageVolumePerCandle = stockVolume / 73;

    for (let i = 0; i < 73; i++) {
      const priceChangePct = (seededRandom() - 0.48) * 0.002; // upward bias for mock
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
   * Main scan task to discover BTST setups.
   */
  static async discoverSignals(dateOverride?: Date): Promise<BtstSignal[]> {
    const currentTime = dateOverride || new Date();
    const dateStr = currentTime.toISOString().split('T')[0];
    const timeStr = currentTime.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

    const state = this.determineState(currentTime);

    // Fetch NSE F&O list from MarketService
    const universeStocks = MarketService.getUniverse('NSE_FNO');
    const signalsToSave: Prisma.BtstSignalCreateInput[] = [];

    for (const stock of universeStocks) {
      try {
        const fullStock = await MarketService.getStockData(stock.symbol);
        if (!fullStock) continue;

        // 1. Calculate Today's CPR levels (using yesterday's history)
        const todayCpr = calculateCPR({
          high: fullStock.high,
          low: fullStock.low,
          close: fullStock.close
        });

        // 2. Calculate Tomorrow's CPR levels (using today's session OHLC)
        const tomorrowCpr = calculateCPR({
          high: fullStock.high,
          low: fullStock.low,
          close: fullStock.ltp // today's close is represented by current LTP in scanning
        });

        // 3. Fetch Intraday metrics (VWAP, 15m high)
        const intraday = await this.getIntradayData(fullStock, currentTime);

        // 4. Verify Eligibility & Rejection Rules
        const eligibility = EntryManagerService.evaluateEligibility(
          fullStock,
          tomorrowCpr,
          todayCpr,
          intraday.vwap,
          intraday.intradayVolume,
          intraday.hasIntraday
        );

        // 5. Calculate Score & Classification
        let score: number | null = null;
        let classification = 'IGNORE';
        let stopLoss = 0;
        let target = 0;
        let riskMetrics = null;
        let gapMetrics = null;

        if (eligibility.eligible) {
          score = BtstRankingService.calculateScore({
            volume: fullStock.volume,
            avgVolume: fullStock.avgVolume,
            tomorrowCprWidth: tomorrowCpr.width,
            tomorrowBc: tomorrowCpr.bc,
            todayTc: todayCpr.tc,
            close: fullStock.ltp,
            high: fullStock.high,
            low: fullStock.low,
            vwap: intraday.vwap,
            intradayVolume: intraday.intradayVolume,
            last15mHigh: intraday.last15mHigh,
            hasConfirmationCandles: intraday.hasIntraday
          });

          classification = BtstRankingService.getClassification(score);

          // BTST Stop Loss = min(Signal Low, tomorrow's BC)
          stopLoss = Math.min(fullStock.low, tomorrowCpr.bc);

          // BTST Target = Entry + 2.5x Risk (Entry is current price/LTP)
          const entryPrice = fullStock.ltp;
          const riskAmount = entryPrice - stopLoss;
          target = entryPrice + (riskAmount > 0 ? riskAmount * 2.5 : entryPrice * 0.05);

          // Risk & Gap predictions
          riskMetrics = OvernightRiskService.calculateOvernightRisk(fullStock);
          gapMetrics = GapProbabilityService.calculateGapProbability(fullStock);
        }

        const signalObj = {
          symbol: stock.symbol,
          signalDate: dateStr,
          signalTime: timeStr,
          entry: eligibility.eligible ? fullStock.ltp : null,
          stopLoss: eligibility.eligible ? stopLoss : null,
          target: eligibility.eligible ? target : null,
          btstScore: score,
          expectedGap: eligibility.eligible && gapMetrics ? gapMetrics.expectedGap : null,
          expectedMove: eligibility.eligible && gapMetrics ? gapMetrics.expectedGap * 2.0 : null, // estimated move is gap * multiplier
          riskLevel: eligibility.eligible && riskMetrics ? riskMetrics.riskLevel : null,
          confidence: eligibility.eligible && gapMetrics ? gapMetrics.gapConfidence : null,
          exitStrategy: eligibility.eligible ? 'R1' : null,
          actualExit: null,
          actualReturn: null,
          executed: false,
          classification,
          state: eligibility.eligible ? state : 'FROZEN', // Rejected signals are stored as FROZEN/IGNORE
          freezeTime: state === 'FROZEN' ? timeStr : null,
          rejectionReason: eligibility.eligible ? null : (eligibility.reason || 'Failed scoring safety'),
          version: 1
        };

        signalsToSave.push(signalObj);

      } catch (err) {
        console.error(`Error processing BTST scan for ${stock.symbol}:`, err);
      }
    }

    // Sort signals to save: eligible and high score first
    signalsToSave.sort((a, b) => {
      if (a.classification === 'IGNORE' && b.classification !== 'IGNORE') return 1;
      if (a.classification !== 'IGNORE' && b.classification === 'IGNORE') return -1;
      return (b.btstScore || 0) - (a.btstScore || 0);
    });

    // Save/Upsert signals in SQLite
    const savedSignals = [];
    for (const sig of signalsToSave) {
      const saved = await prisma.btstSignal.upsert({
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
