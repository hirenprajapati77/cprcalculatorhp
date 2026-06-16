import { MarketStockData } from '../market.service';
import { calculateCPR, CprResult } from '@/lib/cpr-engine';

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

export class BtstService {
  /**
   * Checks if the 15:20-15:25 IST window is open.
   */
  static isExecutionWindowOpen(): boolean {
    if (process.env.BTST_BYPASS_WINDOW === 'true') {
      return true;
    }

    const now = new Date();
    // Get time in IST
    const istOptions = { timeZone: 'Asia/Kolkata', hour12: false, hour: 'numeric', minute: 'numeric' } as const;
    const parts = new Intl.DateTimeFormat('en-US', istOptions).formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour')?.value;
    const minutePart = parts.find(p => p.type === 'minute')?.value;

    if (hourPart && minutePart) {
      const istHour = parseInt(hourPart, 10);
      const istMin = parseInt(minutePart, 10);
      return istHour === 15 && istMin >= 20 && istMin <= 25;
    }

    // Fallback if formatting fails for some reason
    const istOffset = 5.5 * 60 * 60 * 1000;
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utcTime + istOffset);
    const hour = istTime.getHours();
    const min = istTime.getMinutes();
    return hour === 15 && min >= 20 && min <= 25;
  }

  /**
   * Calculates the LONG BTST Score (Max 100).
   */
  static calculateLongScore(
    stock: MarketStockData,
    todayCpr: CprResult,
    tomorrowCpr: CprResult,
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
    todayCpr: CprResult,
    tomorrowCpr: CprResult,
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
    // CPR Computations
    let prevHigh = stock.high;
    let prevLow = stock.low;
    let prevClose = stock.close; // This is yesterday's close

    if (stock.history && stock.history.length > 1) {
      const yesterday = stock.history[stock.history.length - 2];
      prevHigh = yesterday.high;
      prevLow = yesterday.low;
      prevClose = yesterday.close;
    }

    const todayCpr = calculateCPR({ high: prevHigh, low: prevLow, close: prevClose });
    const tomorrowCpr = calculateCPR({ high: stock.high, low: stock.low, close: stock.ltp });

    const virginCPR = stock.low > Math.max(todayCpr.tc, todayCpr.bc) || stock.high < Math.min(todayCpr.tc, todayCpr.bc);
    
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    const longCalc = this.calculateLongScore(stock, todayCpr, tomorrowCpr, volumeRatio, virginCPR);
    const shortCalc = this.calculateShortScore(stock, todayCpr, tomorrowCpr, volumeRatio, virginCPR);

    const longScore = longCalc.score;
    const shortScore = shortCalc.score;
    
    let tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK' = 'NEUTRAL_CONFLICT';
    let finalSignals: string[] = [];
    let entry = stock.ltp;
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
