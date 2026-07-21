import { env } from '@/config/env';
/**
 * Live discovery (`discover`) delegates to OvernightService Advanced engine
 * via advanced-discover-bridge (Phase H option a). Simple evaluateOvernight /
 * score helpers remain for backtests and V2 shadow only (max 100).
 */
import { MarketStockData } from '../market.service';
import { VOLUME_THRESHOLDS, CPR_THRESHOLDS, ATR, BTST_SCORING, LIQUIDITY } from '@/config/trading-constants';
import { calculateCPR, isCprVirgin } from '@/lib/cpr-engine';
import { getAtrPct, calculateATR } from '@/lib/atr';
import { compareCpr } from '@/lib/cpr-relationship';
import { CPRResult } from '@/types/cpr.types';
import { GapProbabilityService } from '../overnight/gap-probability.service';
import { isMarketOpen, isTodayCandleClosed, getISTDateString, isBtstDiscoveryOpen, getCompletedHistory } from '@/lib/market-hours';
import { discoverViaAdvancedEngine } from '../overnight/advanced-discover-bridge';

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
    clvScore?: number;
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
   * Checks if the canonical discovery window is open ([DISCOVERY_START, ACTIVE_END)).
   */
  static isExecutionWindowOpen(bypassQuery?: boolean, now: Date = new Date()): boolean {
    const bypassAllowed =
      bypassQuery ||
      (env.NODE_ENV !== 'production' && env.BTST_BYPASS_WINDOW === 'true');

    if (bypassAllowed) {
      return true;
    }

    return isBtstDiscoveryOpen(now);
  }

  /**
   * Live discovery — Advanced Engine only (OvernightService via bridge).
   * `strategyVariant` is accepted for API compatibility but ignored; backtests
   * must call evaluateOvernight(..., strategyVariant) directly.
   */
  static async discover(
    universe: string,
    _strategyVariant:
      | 'baseline'
      | 'cpr_aware'
      | 'no_vdu_weighted'
      | 'clv_continuous'
      | 'clv_hybrid' = 'baseline'
  ) {
    return discoverViaAdvancedEngine(universe);
  }

  // NOTE: Simple score helpers below are for evaluateOvernight / backtests only
  // (additive 0-100). Live discover uses Advanced (max 130) via the bridge.
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
    const { isHigherValue } = compareCpr(todayCpr, tomorrowCpr);
    const isClvVariant = strategyVariant === 'clv_continuous' || strategyVariant === 'clv_hybrid';
    if (isHigherValue && !isClvVariant) {
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
        score = Math.round(((clv + 1) / 2) * BTST_SCORING.CLV_BASE_MULTIPLIER);
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
    const { isLowerValue } = compareCpr(todayCpr, tomorrowCpr);
    const isClvVariant = strategyVariant === 'clv_continuous' || strategyVariant === 'clv_hybrid';
    if (isLowerValue && !isClvVariant) {
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
        score = Math.round(((-clv + 1) / 2) * BTST_SCORING.CLV_BASE_MULTIPLIER);
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
    const todayStr = asOfDate ?? getISTDateString();
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    let isLastToday = false;
    let isTodayCandleFinal = false;
    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      isLastToday = lastCandle.date === todayStr;
      
      isTodayCandleFinal = asOfDate 
        ? isLastToday 
        : (isLastToday && isTodayCandleClosed());
      
      todayCandle = isTodayCandleFinal ? lastCandle : {
        high: stock.high,
        low: stock.low,
        close: stock.ltp
      };
      
      yesterdayCandle = isLastToday 
        ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
        : lastCandle;
    }

    const completedHistory = getCompletedHistory(stock.history || [], asOfDate);
    const atrRefClose =
      completedHistory.length > 0
        ? completedHistory[completedHistory.length - 1].close
        : stock.close;
    const atrPct = getAtrPct(completedHistory, atrRefClose);

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

    const dominantDirection = longScore >= shortScore ? 'LONG' : 'SHORT';

    if (dominantDirection === 'LONG') {
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
    } else {
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
    const isClvVariant = strategyVariant === 'clv_continuous' || strategyVariant === 'clv_hybrid';
    const isClvContinuous = strategyVariant === 'clv_continuous';

    let clvScore = 0;
    if (isClvVariant) {
      const high = stock.high || 0;
      const low = stock.low || 0;
      if (high !== low) {
        const close = stock.ltp;
        const clv = ((close - low) - (high - close)) / (high - low);
        const factor = isLong ? clv : -clv;
        const multiplier = strategyVariant === 'clv_continuous' ? BTST_SCORING.CLV_CONTINUOUS_MULTIPLIER : BTST_SCORING.CLV_BASE_MULTIPLIER;
        clvScore = Math.round(((factor + 1) / 2) * multiplier);
      }
    }

    let vduPoints = (!isClvVariant && volumeRatio >= 2.0) ? 20 : 0;
    const hvPoints = isClvVariant ? 0 : (isLong
      ? (tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc ? 20 : 0)
      : (tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc ? 20 : 0));

    // For clv_continuous, it exits early in calculateLongScore/ShortScore, so other parameters are 0
    // For clv_hybrid, cprPoints (15) and liquidity (10) remain active and additive
    let cprPoints = isClvContinuous ? 0 : ((tomorrowCpr.classification === 'NARROW' || sessionVirgin) ? 15 : 0);

    if (strategyVariant === 'no_vdu_weighted') {
      vduPoints = 0;
      const cprWeight = env.CPR_WEIGHT !== undefined ? env.CPR_WEIGHT : 35;
      cprPoints = (tomorrowCpr.classification === 'NARROW' || sessionVirgin) ? cprWeight : 0;
    }

    const vwapPoints = isClvVariant ? 0 : (isLong
      ? (stock.vwap && stock.ltp > stock.vwap * 1.002 ? 20 : 0)
      : (stock.vwap && stock.ltp < stock.vwap * 0.998 ? 20 : 0));

    const closeStrengthPoints = isClvVariant ? 0 : (stock.candle15m
      ? (isLong
          ? (stock.candle15m.close >= stock.candle15m.high * 0.995 ? 15 : 0)
          : (stock.candle15m.close <= stock.candle15m.low * 1.005 ? 15 : 0))
      : 0);

    const liqPoints = isClvContinuous ? 0 : (stock.avgVolume >= 500000 ? 10 : 0);

    const scoreBreakdown = {
      vdu: vduPoints,
      cprNarrow: cprPoints,
      higherValue: hvPoints,
      vwap: vwapPoints,
      closeStrength: closeStrengthPoints,
      liquidity: liqPoints,
      ...(isClvVariant ? { clvScore } : {})
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
      tomorrowCPRProvisional: isMarketOpen() && !isTodayCandleFinal,
      scoreBreakdown
    };
  }

  static evaluateOvernightV2(
    stock: MarketStockData,
    asOfDate?: string
  ) {
    const todayStr = asOfDate ?? getISTDateString();
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    let isLastToday = false;
    let isTodayCandleFinal = false;
    if (stock.history && stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      isLastToday = lastCandle.date === todayStr;
      
      isTodayCandleFinal = asOfDate 
        ? isLastToday 
        : (isLastToday && isTodayCandleClosed());
      
      todayCandle = isTodayCandleFinal ? lastCandle : {
        high: stock.high,
        low: stock.low,
        close: stock.ltp
      };
      
      yesterdayCandle = isLastToday 
        ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
        : lastCandle;
    }

    const completedHistory = getCompletedHistory(stock.history || [], asOfDate);
    const atrRefClose =
      completedHistory.length > 0
        ? completedHistory[completedHistory.length - 1].close
        : stock.close;
    const atrPct = getAtrPct(completedHistory, atrRefClose);

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

    // 1. CLV Calculation
    const range = todayCandle.high - todayCandle.low;
    let clv = range > 0 ? ((2 * todayCandle.close - todayCandle.high - todayCandle.low) / range) : 0;
    clv = Math.max(-1, Math.min(1, clv));

    const isHvLong = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
    const isLvShort = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;

    const direction: 'LONG' | 'SHORT' | 'NEUTRAL' = isHvLong ? 'LONG' : (isLvShort ? 'SHORT' : 'NEUTRAL');
    const hvPassed = direction === 'LONG' ? isHvLong : (direction === 'SHORT' ? isLvShort : false);
    
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
      clvScore = Math.round(((clv + 1) / 2) * BTST_SCORING.CLV_BASE_MULTIPLIER);
    } else if (direction === 'SHORT') {
      clvScore = Math.round(((-clv + 1) / 2) * BTST_SCORING.CLV_BASE_MULTIPLIER);
    } else {
      clvScore = 0;
    }

    let cprScore = 0;
    if (tomorrowCpr.classification === 'NARROW' || sessionVirgin) {
      cprScore = 15;
    }

    let liquidityScore = 0;
    if (liquidityPassed) {
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
