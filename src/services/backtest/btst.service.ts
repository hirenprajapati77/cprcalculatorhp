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
    sessionVirgin: boolean
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

    if (tomorrowCpr.classification === 'NARROW' || sessionVirgin) {
      score += 15;
      if (tomorrowCpr.classification === 'NARROW') signals.push('NARROW_CPR');
      // VIRGIN_TODAY = today's live session hasn't touched today's CPR band.
      // Distinct from scanner's VIRGIN = yesterday's CPR was retrospectively untouched.
      if (sessionVirgin) signals.push('VIRGIN_TODAY');
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
    sessionVirgin: boolean
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

    if (tomorrowCpr.classification === 'NARROW' || sessionVirgin) {
      score += 15;
      if (tomorrowCpr.classification === 'NARROW') signals.push('NARROW_CPR');
      if (sessionVirgin) signals.push('VIRGIN_TODAY');
    }

    // +10 Liquidity: avgVolume >= 500000
    if (stock.avgVolume >= 500000) {
      score += 10;
      signals.push('LIQUID');
    }

    return { score, signals: Array.from(new Set(signals)) };
  }

  static evaluateOvernight(stock: MarketStockData, asOfDate?: string, strategyVariant: 'baseline' | 'cpr_aware' | 'no_vdu_weighted' = 'baseline'): BtstScoreResult {
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

    const longCalc = this.calculateLongScore(stock, todayCpr, tomorrowCpr, volumeRatio, sessionVirgin);
    const shortCalc = this.calculateShortScore(stock, todayCpr, tomorrowCpr, volumeRatio, sessionVirgin);

    const longScore = longCalc.score;
    const shortScore = shortCalc.score;
    let tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK' = 'NEUTRAL_CONFLICT';
    let finalSignals: string[] = [];
    const entry = stock.ltp;
    let sl = 0;
    let target = 0;
    let rrStr = '1:2.0';

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
    let hvPoints = isLong
      ? (tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc ? 20 : 0)
      : (tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc ? 20 : 0);
    let liqPoints = stock.avgVolume >= 500000 ? 10 : 0;

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

    let finalScoreToReturn = maxScore;
    if (strategyVariant === 'no_vdu_weighted') {
      finalScoreToReturn = (tag === 'LONG' || tag === 'SHORT') ? 
        scoreBreakdown.cprNarrow + scoreBreakdown.higherValue + scoreBreakdown.liquidity : maxScore;
    }

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
    sectorReturn: number,
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

    // CLV
    const range = todayCandle.high - todayCandle.low;
    let clv = range > 0 ? ((2 * todayCandle.close - todayCandle.high - todayCandle.low) / range) : 0;
    clv = Math.max(-1, Math.min(1, clv));

    // Volume Ratio
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1.0;

    // CPR Width
    const pivot = tomorrowCpr.pivot;
    const tc = tomorrowCpr.tc;
    const bc = tomorrowCpr.bc;
    const cprWidth = pivot > 0 ? (Math.abs(tc - bc) / pivot) * 100 : 999.0;

    // Relative Strength
    const stockReturn = yesterdayCandle.close > 0 ? ((todayCandle.close - yesterdayCandle.close) / yesterdayCandle.close) * 100 : 0;
    const relativeStrength = stockReturn - sectorReturn;

    // VWAP distance
    const vwapDistance = stock.vwap && stock.vwap > 0 ? ((stock.ltp - stock.vwap) / stock.vwap) * 100 : 0;

    const isHvLong = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
    const isLvShort = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;

    const direction: 'LONG' | 'SHORT' = isHvLong ? 'LONG' : (isLvShort ? 'SHORT' : 'LONG');

    const hvPassed = direction === 'LONG' ? isHvLong : isLvShort;
    const liquidityPassed = stock.avgVolume >= 500000 && (stock.ltp * stock.volume) >= 150000000;
    const vwapPassed = direction === 'LONG'
      ? (stock.vwap ? stock.ltp > stock.vwap : true)
      : (stock.vwap ? stock.ltp < stock.vwap : true);

    const allGatesPassed = hvPassed && liquidityPassed && vwapPassed;

    // Scoring
    let clvScore = 0;
    if (clv <= 0) clvScore = 0;
    else if (clv <= 0.25) clvScore = 5;
    else if (clv <= 0.50) clvScore = 10;
    else if (clv <= 0.70) clvScore = 18;
    else if (clv <= 0.85) clvScore = 27;
    else clvScore = 35;

    let volumeScore = 0;
    if (volumeRatio < 1.0) volumeScore = 0;
    else if (volumeRatio < 1.5) volumeScore = 5;
    else if (volumeRatio < 2.0) volumeScore = 10;
    else if (volumeRatio < 3.0) volumeScore = 18;
    else if (volumeRatio < 4.0) volumeScore = 22;
    else volumeScore = 25;

    let cprScore = 0;
    if (cprWidth > 0.70) cprScore = 0;
    else if (cprWidth > 0.50) cprScore = 5;
    else if (cprWidth > 0.30) cprScore = 10;
    else if (cprWidth > 0.15) cprScore = 15;
    else cprScore = 20;

    let relativeStrengthScore = 0;
    if (relativeStrength <= 0) relativeStrengthScore = 0;
    else if (relativeStrength <= 0.50) relativeStrengthScore = 5;
    else if (relativeStrength <= 1.00) relativeStrengthScore = 10;
    else if (relativeStrength <= 1.50) relativeStrengthScore = 13;
    else relativeStrengthScore = 15;

    const confidenceBuffer = 0;

    const finalScore = allGatesPassed
      ? (clvScore + volumeScore + cprScore + relativeStrengthScore + confidenceBuffer)
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
        hvPassed,
        liquidityPassed,
        vwapPassed
      },
      scoreBreakdown: {
        clvScore,
        volumeScore,
        cprScore,
        relativeStrengthScore,
        confidenceBuffer
      },
      rawMetrics: {
        clv,
        volumeRatio,
        cprWidth,
        relativeStrength,
        vwapDistance
      },
      finalScore,
      classification
    };
  }
}
