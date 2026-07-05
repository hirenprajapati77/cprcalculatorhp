/**
 * SIMPLE ENGINE — AUTHORITATIVE. Currently used by /api/btst, ScannerClient UI tabs
 * (BTST/STBT/OVERNIGHT), and the Telegram cron alert. Max score 100.
 * 
 * TODO: Phase H migration — validate Advanced Engine signals against
 * Simple Engine on live market data before promoting to UI/cron.
 * See project audit notes.
 */
import { MarketStockData, MarketService } from '../market.service';
import { calculateCPR, isCprVirgin } from '@/lib/cpr-engine';
import { CPRResult } from '@/types/cpr.types';
import { GapProbabilityService } from '../overnight/gap-probability.service';
import { isMarketOpen } from '@/lib/market-hours';

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
  tomorrowCPRProvisional?: boolean;
  scoreBreakdown?: {
    vdu?: number;
    cprNarrow?: number;
    higherValue?: number;
    vwap?: number;
    liquidity?: number;   // was conf15m (misnomer — was always avgVolume gate, not 15m candle)
    closeStrength?: number;
  };
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
  static async discover(universe: string, strategyVariant: 'baseline' | 'cpr_aware' | 'no_vdu_weighted' | 'clv_continuous' | 'clv_hybrid' = 'baseline') {
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
        const result = this.evaluateOvernight(stock, undefined, strategyVariant);

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

  // NOTE: This engine uses raw market data signals (VWAP, 15m candle, 
  // CPR value relationship) appropriate for overnight BTST/STBT positions.
  // Score scale is additive 0-100, separate from the intraday scanner's
  // weighted composite scoring in ranking.service.ts.
  // TODO: Phase H — replace with Advanced Engine (overnight.service.ts) 
  // which uses btst-ranking.service.ts weighted system (max 130).
  // Do not apply ranking.service.ts catA/B/C/D weights here.
  /**
   * Calculates the LONG BTST Score (Max 100).
   */
  static calculateLongScore(
    stock: MarketStockData,
    todayCpr: CPRResult,
    tomorrowCpr: CPRResult,
    volumeRatio: number,
    sessionVirgin: boolean,
    strategyVariant: 'baseline' | 'cpr_aware' | 'no_vdu_weighted' | 'clv_continuous' | 'clv_hybrid'
  ): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // +20 Value Relationship: higherValue === true
    const higherValue = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
    if (higherValue) {
      score += 20;
      signals.push('HIGHER_VALUE');
    }

    if (strategyVariant === 'clv_continuous' || strategyVariant === 'clv_hybrid') {
      const high = stock.high || 0;
      const low = stock.low || 0;
      if (high === low) {
        console.warn(`[CLV] Symbol ${stock.symbol} has no range (high === low). Defaulting score to 0.`);
        return { score: 0, signals: ['CLV_SCORED'] };
      }
      const close = stock.ltp;
      const clv = ((close - low) - (high - close)) / (high - low);
      
      if (strategyVariant === 'clv_continuous') {
        score = Math.round(((clv + 1) / 2) * 100);
        signals.push('CLV_SCORED');
        return { score, signals };
      } else {
        score = Math.round(((clv + 1) / 2) * 75);
        signals.push('CLV_HYBRID_BASE');
      }
    }

    const isNoVdu = strategyVariant === 'no_vdu_weighted';

    if (strategyVariant !== 'clv_hybrid') {
      // +20 Volume Expansion (unless no_vdu_weighted)
      if (!isNoVdu && volumeRatio >= 2.0) {
        score += 20;
        signals.push('VOLUME_SPIKE');
      }

      // +20 Price vs VWAP: ltp > vwap * 1.002
      if (stock.vwap && stock.ltp > stock.vwap * 1.002) {
        score += 20;
        signals.push('ABOVE_VWAP');
      }
    }

    // CPR Narrow weight conditionally applied
    const cprNarrowWeight = isNoVdu ? 35 : 15;
    if (tomorrowCpr.classification === 'NARROW' || sessionVirgin) {
      score += cprNarrowWeight;
      if (tomorrowCpr.classification === 'NARROW') signals.push('NARROW_CPR');
      if (sessionVirgin) signals.push('VIRGIN_TODAY');
    }

    if (strategyVariant !== 'clv_hybrid') {
      // +15 Closing Strength: 15min candle close >= (15min candle high * 0.995)
      if (stock.candle15m) {
        const { high, close } = stock.candle15m;
        if (close >= high * 0.995) {
          score += 15;
          signals.push('CLOSING_STRENGTH');
        }
      }
    }

    // +10 Liquidity: avgVolume >= 500000
    if (stock.avgVolume >= 500000) {
      score += 10;
      signals.push('LIQUID');
    }

    return { score: Math.min(score, 100), signals: Array.from(new Set(signals)) };
  }

  /**
   * Calculates the SHORT STBT Score (Max 100).
   */
  static calculateShortScore(
    stock: MarketStockData,
    todayCpr: CPRResult,
    tomorrowCpr: CPRResult,
    volumeRatio: number,
    sessionVirgin: boolean,
    strategyVariant: 'baseline' | 'cpr_aware' | 'no_vdu_weighted' | 'clv_continuous' | 'clv_hybrid'
  ): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    // +20 Value Relationship: lowerValue === true
    const lowerValue = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;
    if (lowerValue) {
      score += 20;
      signals.push('LOWER_VALUE');
    }

    if (strategyVariant === 'clv_continuous' || strategyVariant === 'clv_hybrid') {
      const high = stock.high || 0;
      const low = stock.low || 0;
      if (high === low) {
        console.warn(`[CLV] Symbol ${stock.symbol} has no range (high === low). Defaulting score to 0.`);
        return { score: 0, signals: ['CLV_SCORED'] };
      }
      const close = stock.ltp;
      const clv = ((close - low) - (high - close)) / (high - low);
      
      if (strategyVariant === 'clv_continuous') {
        score = Math.round(((-clv + 1) / 2) * 100);
        signals.push('CLV_SCORED');
        return { score, signals };
      } else {
        score = Math.round(((-clv + 1) / 2) * 75);
        signals.push('CLV_HYBRID_BASE');
      }
    }

    const isNoVdu = strategyVariant === 'no_vdu_weighted';

    if (strategyVariant !== 'clv_hybrid') {
      // +20 Volume Expansion
      if (!isNoVdu && volumeRatio >= 2.0) {
        score += 20;
        signals.push('VOLUME_SPIKE');
      }

      // +20 Price vs VWAP: ltp < vwap * 0.998
      if (stock.vwap && stock.ltp < stock.vwap * 0.998) {
        score += 20;
        signals.push('BELOW_VWAP');
      }
    }

    // CPR Narrow weight conditionally applied
    const cprNarrowWeight = isNoVdu ? 35 : 15;
    if (tomorrowCpr.classification === 'NARROW' || sessionVirgin) {
      score += cprNarrowWeight;
      if (tomorrowCpr.classification === 'NARROW') signals.push('NARROW_CPR');
      if (sessionVirgin) signals.push('VIRGIN_TODAY');
    }

    if (strategyVariant !== 'clv_hybrid') {
      // +15 Closing Weakness: 15min candle close <= (15min candle low * 1.005)
      if (stock.candle15m) {
        const { low, close } = stock.candle15m;
        if (close <= low * 1.005) {
          score += 15;
          signals.push('CLOSING_WEAKNESS');
        }
      }
    }

    // +10 Liquidity: avgVolume >= 500000
    if (stock.avgVolume >= 500000) {
      score += 10;
      signals.push('LIQUID');
    }

    return { score: Math.min(score, 100), signals: Array.from(new Set(signals)) };
  }

  static evaluateOvernight(stock: MarketStockData, asOfDate?: string, strategyVariant: 'baseline' | 'cpr_aware' | 'no_vdu_weighted' | 'clv_continuous' | 'clv_hybrid' = 'baseline'): BtstScoreResult {
    const todayStr = asOfDate ?? new Date().toISOString().split('T')[0];
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    let isLastToday = false;
    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      isLastToday = lastCandle.date === todayStr;
      
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

    // sessionVirgin: today's live price action hasn't touched today's CPR band.
    // Distinct from signal.service.ts's VIRGIN (yesterday's CPR was untouched — retrospective).
    const sessionVirgin = isCprVirgin(stock.high, stock.low, todayCpr.tc, todayCpr.bc);
    
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    const longCalc = this.calculateLongScore(stock, todayCpr, tomorrowCpr, volumeRatio, sessionVirgin, strategyVariant);
    const shortCalc = this.calculateShortScore(stock, todayCpr, tomorrowCpr, volumeRatio, sessionVirgin, strategyVariant);

    const longScore = longCalc.score;
    const shortScore = shortCalc.score;
    let tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK' = 'NEUTRAL_CONFLICT';
    let finalSignals: string[] = [];
    const entry = stock.ltp;
    let sl = 0;
    let target = 0;
    let rrStr = '1:2.0';

    const maxScore = Math.max(longScore, shortScore);

    // Harder threshold logic
    if (maxScore < 10) {
      tag = 'WEAK';
      finalSignals = [];
    } else if (Math.abs(longScore - shortScore) < 14) {
      tag = 'NEUTRAL_CONFLICT';
      finalSignals = longScore >= shortScore ? longCalc.signals : shortCalc.signals;
    } else if (longScore - shortScore >= 14) {
      tag = 'LONG';
      finalSignals = longCalc.signals;
    } else {
      tag = 'SHORT';
      finalSignals = shortCalc.signals;
    }

    if (tag === 'LONG') {
      sl = stock.low;
      target = entry + (entry - sl) * 2;
      
      if (strategyVariant === 'cpr_aware') {
        sl = Math.min(stock.low, tomorrowCpr.bc);
        const risk = entry - sl;
        if (risk > 0) {
          const r2Rr = (tomorrowCpr.r2 - entry) / risk;
          const r1Rr = (tomorrowCpr.r1 - entry) / risk;
          if (r2Rr >= 1.5)      { target = tomorrowCpr.r2; rrStr = `1:${r2Rr.toFixed(1)}`; }
          else if (r1Rr >= 1.5) { target = tomorrowCpr.r1; rrStr = `1:${r1Rr.toFixed(1)}`; }
          else                  { target = entry + risk * 2.0; rrStr = '1:2.0'; }
        }
      }
    } else if (tag === 'SHORT') {
      sl = stock.high;
      target = entry - (sl - entry) * 2;

      if (strategyVariant === 'cpr_aware') {
        sl = Math.max(stock.high, tomorrowCpr.tc);
        const risk = sl - entry;
        if (risk > 0) {
          const s2Rr = (entry - tomorrowCpr.s2) / risk;
          const s1Rr = (entry - tomorrowCpr.s1) / risk;
          if (s2Rr >= 1.5)      { target = tomorrowCpr.s2; rrStr = `1:${s2Rr.toFixed(1)}`; }
          else if (s1Rr >= 1.5) { target = tomorrowCpr.s1; rrStr = `1:${s1Rr.toFixed(1)}`; }
          else                  { target = entry - risk * 2.0; rrStr = '1:2.0'; }
        }
      }
    }

    const isLong = tag === 'LONG' || (tag !== 'SHORT' && longScore >= shortScore);
    
    let vduPoints = volumeRatio >= 2.0 ? 20 : 0;
    let cprPoints = (tomorrowCpr.classification === 'NARROW' || sessionVirgin) ? 15 : 0;
    const hvPoints = isLong
      ? (tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc ? 20 : 0)
      : (tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc ? 20 : 0);
    const liqPoints = stock.avgVolume >= 500000 ? 10 : 0;

    if (strategyVariant === 'no_vdu_weighted') {
      vduPoints = 0;
      const cprWeight = process.env.CPR_WEIGHT ? parseInt(process.env.CPR_WEIGHT, 10) : 35;
      cprPoints = (tomorrowCpr.classification === 'NARROW' || sessionVirgin) ? cprWeight : 0;
    }

    const scoreBreakdown = {
      vdu: vduPoints,
      cprNarrow: cprPoints,
      higherValue: hvPoints,
      vwap: isLong
        ? (stock.vwap && stock.ltp > stock.vwap * 1.002 ? 20 : 0)
        : (stock.vwap && stock.ltp < stock.vwap * 0.998 ? 20 : 0),
      closeStrength: stock.candle15m
        ? (isLong
            ? (stock.candle15m.close >= stock.candle15m.high * 0.995 ? 15 : 0)
            : (stock.candle15m.close <= stock.candle15m.low * 1.005 ? 15 : 0))
        : 0,
      liquidity: liqPoints
    };

    return {
      symbol: stock.symbol,
      ltp: stock.ltp,
      longScore: longScore,
      shortScore: shortScore,
      tag,
      signals: finalSignals,
      entry,
      sl,
      target,
      rr: rrStr,
      sector: stock.sector,
      marketCap: stock.marketCap,
      tomorrowCPRProvisional: isMarketOpen() && !isLastToday,
      scoreBreakdown
    };
  }

  static evaluateOvernightV2(
    stock: MarketStockData,
    asOfDate?: string
  ) {
    const todayStr = asOfDate ?? new Date().toISOString().split('T')[0];
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    let isLastToday = false;
    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      isLastToday = lastCandle.date === todayStr;
      
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

    // 1. CLV Calculation
    const range = todayCandle.high - todayCandle.low;
    let clv = range > 0 ? ((2 * todayCandle.close - todayCandle.high - todayCandle.low) / range) : 0;
    clv = Math.max(-1, Math.min(1, clv));

    const isHvLong = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
    const isLvShort = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;

    const direction: 'LONG' | 'SHORT' = isHvLong ? 'LONG' : (isLvShort ? 'SHORT' : 'LONG');
    const hvPassed = direction === 'LONG' ? isHvLong : isLvShort;
    
    // Validated liquidity gate (from baseline)
    const liquidityPassed = stock.avgVolume >= 500000 && (stock.ltp * stock.volume) >= 150000000;
    
    // Gate logic: We only require higherValue / lowerValue for the V2 shadow logic, 
    // keeping it strictly around validated features as requested.
    const allGatesPassed = hvPassed;

    // sessionVirgin: today's live price action hasn't touched today's CPR band.
    const sessionVirgin = isCprVirgin(stock.high, stock.low, todayCpr.tc, todayCpr.bc);

    // 2. Scoring
    let clvScore = 0;
    if (direction === 'LONG') {
      clvScore = Math.round(((clv + 1) / 2) * 75);
    } else {
      clvScore = Math.round(((-clv + 1) / 2) * 75);
    }

    let cprScore = 0;
    if (tomorrowCpr.classification === 'NARROW' || sessionVirgin) {
      cprScore = 15;
    }

    let liquidityScore = 0;
    if (stock.avgVolume >= 500000) {
      liquidityScore = 10;
    }

    const finalScore = allGatesPassed
      ? (clvScore + cprScore + liquidityScore)
      : 0;

    let classification: 'REJECT' | 'MANUAL_REVIEW' | 'WATCHLIST' | 'PRODUCTION_ALERT' | 'ELITE_INSTITUTIONAL' = 'REJECT';
    if (finalScore < 60) classification = 'REJECT';
    else if (finalScore < 70) classification = 'MANUAL_REVIEW';
    else if (finalScore < 80) classification = 'WATCHLIST';
    else if (finalScore < 90) classification = 'PRODUCTION_ALERT';
    else classification = 'ELITE_INSTITUTIONAL';

    return {
      symbol: stock.symbol,
      direction,
      hardGates: {
        hvPassed
      },
      scoreBreakdown: {
        clvScore,
        cprScore,
        liquidityScore
      },
      rawMetrics: {
        clv,
        cprWidth: tomorrowCpr.pivot > 0 ? (Math.abs(tomorrowCpr.tc - tomorrowCpr.bc) / tomorrowCpr.pivot) * 100 : 999.0,
        liquidityPassed
      },
      finalScore: Math.min(finalScore, 100),
      classification
    };
  }
}
