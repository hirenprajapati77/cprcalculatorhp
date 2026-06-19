// SIMPLE ENGINE: Used by /api/btst (Nifty50 quick scan)
// Max score 100, no eligibility gates
import { MarketStockData, MarketService } from '../market.service';
import { calculateCPR } from '@/lib/cpr-engine';
import { CPRResult } from '@/types/cpr.types';
import { GapProbabilityService } from '../overnight/gap-probability.service';

export interface BtstScoreResult {
  symbol: string;
  ltp: number;
  longScore: number;
  shortScore: number;
  tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK';
  signals: string[];
  entry: number;
  sl: number;
  target: number;
  rr: string;
  sector: string;
  marketCap: number;
}

export interface BtstScoreResultEnriched extends BtstScoreResult {
  expectedGap: number;
  expectedMove: number;
  gapConfidence: number;
  exitStrategy: string;
}

export class BtstService {
  /**
   * Checks if the 15:10-15:25 IST window is open.
   */
  static isExecutionWindowOpen(bypassQuery?: boolean): boolean {
    const bypassAllowed = 
      bypassQuery ||
      (process.env.NODE_ENV !== 'production' &&
      process.env.BTST_BYPASS_WINDOW === 'true');

    if (bypassAllowed) {
      return true;
    }

    const now = new Date();
    const istDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long'
    }).format(now);
    
    const isWeekend = istDateStr === 'Saturday' 
                   || istDateStr === 'Sunday';
    
    if (isWeekend) return false;

    // Get time in IST
    const istOptions = { timeZone: 'Asia/Kolkata', hour12: false, hour: 'numeric', minute: 'numeric' } as const;
    const parts = new Intl.DateTimeFormat('en-US', istOptions).formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour')?.value;
    const minutePart = parts.find(p => p.type === 'minute')?.value;

    if (hourPart && minutePart) {
      const istHour = parseInt(hourPart, 10);
      const istMin = parseInt(minutePart, 10);
      return (istHour === 15 && istMin >= 10) || (istHour > 15);
    }

    // Fallback if formatting fails for some reason
    const istOffset = 5.5 * 60 * 60 * 1000;
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utcTime + istOffset);
    const hour = istTime.getHours();
    const min = istTime.getMinutes();
    return (hour === 15 && min >= 10) || (hour > 15);
  }

  /**
   * Scans the universe and returns BTST candidates and metrics.
   */
  static async discover(universe: string) {
    const stocks = MarketService.getUniverse(universe as Parameters<typeof MarketService.getUniverse>[0]);
    const results: BtstScoreResultEnriched[] = [];

    let strongSignal = 0;
    let breakoutReady = 0;
    let avoid = 0;
    let totalLong = 0;
    let totalShort = 0;
    let totalConflict = 0;

    const stockPromises = stocks.map(async (stockMeta) => {
      try {
        const stock = await MarketService.getStockData(stockMeta.symbol);
        return { stockMeta, stock };
      } catch (err) {
        console.error(`Failed to fetch stock data for ${stockMeta.symbol}:`, err);
        return { stockMeta, stock: null };
      }
    });

    const stockResults = await Promise.all(stockPromises);

    for (const { stock } of stockResults) {
      if (stock) {
        const result = this.evaluateOvernight(stock);

        // Compute gap probability based on direction
        const direction = result.tag === 'SHORT' ? 'SHORT' : 'LONG';
        const gapMetrics = GapProbabilityService.calculateGapProbability(stock, direction);

        // Count metrics
        const maxScore = Math.max(result.longScore, result.shortScore);

        if (result.tag === 'NEUTRAL_CONFLICT') {
          totalConflict++;
          avoid++;
        } else if (result.tag === 'WEAK') {
          avoid++;
        } else {
          if (maxScore >= 90) {
            strongSignal++;
          } else if (maxScore >= 70) {
            breakoutReady++;
          } else if (maxScore < 40) {
            avoid++;
          }

          if (result.tag === 'LONG') totalLong++;
          if (result.tag === 'SHORT') totalShort++;
        }

        // Exclude WEAK
        if (result.tag !== 'WEAK') {
          results.push({
            ...result,
            expectedGap: gapMetrics.expectedGap,
            expectedMove: parseFloat((gapMetrics.expectedGap * 2.0).toFixed(2)),
            gapConfidence: gapMetrics.gapConfidence,
            exitStrategy: 'EOD'
          });
        }
      }
    }

    // Sort results by max score
    results.sort((a, b) => Math.max(b.longScore, b.shortScore) - Math.max(a.longScore, a.shortScore));

    return {
      results,
      insights: {
        strongSignal,
        breakoutReady,
        avoid,
        totalLong,
        totalShort,
        totalConflict
      }
    };
  }

  /**
   * Calculates the LONG BTST Score (Max 100).
   */
  static calculateLongScore(
    stock: MarketStockData,
    todayCpr: CPRResult,
    tomorrowCpr: CPRResult,
    volumeRatio: number,
    virginCPR: boolean
  ): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // +20 Volume Expansion: volumeRatio >= 2.0 vs 20-day avg
    if (volumeRatio >= 2.0) {
      score += 20;
      signals.push('VOLUME_SPIKE');
    }

    // +20 Value Relationship: higherValue === true (today CPR BC > yesterday CPR BC && TC > TC)
    // Note: 'tomorrowCpr' is based on today's close, which acts as "today's" calculation for the upcoming day.
    // So 'todayCpr' is actually yesterday's calculation that applies to today's trading.
    const higherValue = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
    if (higherValue) {
      score += 20;
      signals.push('HIGHER_VALUE');
    }

    // +20 Price vs VWAP: ltp > vwap * 1.002
    if (stock.vwap && stock.ltp > stock.vwap * 1.002) {
      score += 20;
      signals.push('ABOVE_VWAP');
    }

    // +15 Closing Strength: 15min candle close >= (15min candle high * 0.995)
    if (stock.candle15m) {
      const { high, close } = stock.candle15m;
      if (close >= high * 0.995) {
        score += 15;
        signals.push('CLOSING_STRENGTH');
      }
    }

    // +15 CPR Width: classification === 'NARROW' OR virginCPR === true
    if (tomorrowCpr.classification === 'NARROW' || virginCPR) {
      score += 15;
      if (tomorrowCpr.classification === 'NARROW') signals.push('NARROW_CPR');
      if (virginCPR) signals.push('VIRGIN_CPR');
    }

    // +10 Liquidity: avgVolume >= 500000
    if (stock.avgVolume >= 500000) {
      score += 10;
      signals.push('LIQUID');
    }

    return { score, signals: Array.from(new Set(signals)) };
  }

  /**
   * Calculates the SHORT STBT Score (Max 100).
   */
  static calculateShortScore(
    stock: MarketStockData,
    todayCpr: CPRResult,
    tomorrowCpr: CPRResult,
    volumeRatio: number,
    virginCPR: boolean
  ): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // +20 Volume Expansion
    if (volumeRatio >= 2.0) {
      score += 20;
      signals.push('VOLUME_SPIKE');
    }

    // +20 Value Relationship: lowerValue === true
    const lowerValue = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;
    if (lowerValue) {
      score += 20;
      signals.push('LOWER_VALUE');
    }

    // +20 Price vs VWAP: ltp < vwap * 0.998
    if (stock.vwap && stock.ltp < stock.vwap * 0.998) {
      score += 20;
      signals.push('BELOW_VWAP');
    }

    // +15 Closing Weakness: 15min candle close <= (15min candle low * 1.005)
    if (stock.candle15m) {
      const { low, close } = stock.candle15m;
      if (close <= low * 1.005) {
        score += 15;
        signals.push('CLOSING_WEAKNESS');
      }
    }

    // +15 CPR Width: NARROW or VIRGIN
    if (tomorrowCpr.classification === 'NARROW' || virginCPR) {
      score += 15;
      if (tomorrowCpr.classification === 'NARROW') signals.push('NARROW_CPR');
      if (virginCPR) signals.push('VIRGIN_CPR');
    }

    // +10 Liquidity: avgVolume >= 500000
    if (stock.avgVolume >= 500000) {
      score += 10;
      signals.push('LIQUID');
    }

    return { score, signals: Array.from(new Set(signals)) };
  }

  static evaluateOvernight(stock: MarketStockData): BtstScoreResult {
    const todayStr = new Date().toISOString().split('T')[0];
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      const isLastToday = lastCandle.date === todayStr;
      
      todayCandle = isLastToday ? lastCandle : {
        high: stock.high,
        low: stock.low,
        close: stock.ltp
      };
      
      yesterdayCandle = isLastToday 
        ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
        : lastCandle;
    }

    const todayCpr = calculateCPR({
      high: yesterdayCandle.high,
      low: yesterdayCandle.low,
      close: yesterdayCandle.close,
    });

    const tomorrowCpr = calculateCPR({
      high: todayCandle.high,
      low: todayCandle.low,
      close: todayCandle.close,
    });

    const virginCPR = stock.low > Math.max(todayCpr.tc, todayCpr.bc) || stock.high < Math.min(todayCpr.tc, todayCpr.bc);
    
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    const longCalc = this.calculateLongScore(stock, todayCpr, tomorrowCpr, volumeRatio, virginCPR);
    const shortCalc = this.calculateShortScore(stock, todayCpr, tomorrowCpr, volumeRatio, virginCPR);

    const longScore = longCalc.score;
    const shortScore = shortCalc.score;
    
    let tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK' = 'NEUTRAL_CONFLICT';
    let finalSignals: string[] = [];
    const entry = stock.ltp;
    let sl = 0;
    let target = 0;

    const maxScore = Math.max(longScore, shortScore);

    if (maxScore < 30) {
      tag = 'WEAK';
      finalSignals = [];
    } else if (Math.abs(longScore - shortScore) < 20) {
      tag = 'NEUTRAL_CONFLICT';
      finalSignals = longScore >= shortScore ? longCalc.signals : shortCalc.signals;
    } else if (longScore - shortScore >= 20) {
      tag = 'LONG';
      finalSignals = longCalc.signals;
      sl = stock.low;
      target = entry + (entry - sl) * 2;
    } else {
      tag = 'SHORT';
      finalSignals = shortCalc.signals;
      sl = stock.high;
      target = entry - (sl - entry) * 2;
    }

    return {
      symbol: stock.symbol,
      ltp: stock.ltp,
      longScore,
      shortScore,
      tag,
      signals: finalSignals,
      entry,
      sl,
      target,
      rr: '1:2.0',
      sector: stock.sector,
      marketCap: stock.marketCap
    };
  }
}
