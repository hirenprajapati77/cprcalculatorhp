import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { MarketStockData } from './market.service';
import { SignalService } from './signal.service';
import { RankingService } from './ranking.service';
import { isMarketOpen, isTodayCandleClosed, getISTDateString } from '@/lib/market-hours';
import { CprCompressionService, CprCompressionStats } from './cpr-compression.service';
import { compareCpr } from '@/lib/cpr-relationship';

export interface ScannerSignalResult extends MarketStockData {
  pivot: number;
  bc: number;
  tc: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  width: number;
  classification: 'NARROW' | 'NORMAL' | 'WIDE';
  signals: string[]; // Active signal tags
  score: number; // Quant score
  entry: number;
  sl: number;
  target: number;
  rr: string; // Risk-Reward ratio, e.g. "1:2.5"
  confidence: number; // Trade confidence percentage
  tomorrowCPRProvisional?: boolean;
  degenerateData?: boolean;
  distPivot?: number;
  cprCompression?: CprCompressionStats | null;
  cprQuality?: 'A+' | 'A' | 'B' | 'C' | undefined;
}


export class ScannerService {
  /**
   * Evaluates all CPR levels, price-action signals, entry targets, and SL parameters.
   * Now async to fetch cached CPR compression history.
   */
  static async scanStock(stock: MarketStockData, asOfDate?: string): Promise<ScannerSignalResult> {
    // Differentiate yesterday's and today's daily candles robustly
    const todayStr = asOfDate || getISTDateString();
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    let isLastToday = false;
    let isTodayCandleFinal = false;
    let degenerateData = false;
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
      
      if (isTodayCandleFinal && stock.history.length < 2) {
        console.warn(`[ScannerService] Degenerate CPR for ${stock.symbol} (history length: ${stock.history.length}). Computed against itself.`);
        degenerateData = true;
      }
      
      yesterdayCandle = isTodayCandleFinal 
        ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
        : lastCandle;
    }

    const atrPct = getAtrPct(stock.history || [], stock.close);

    // 1. Calculate Today's CPR using yesterday's OHLC
    const cprToday = calculateCPR({
      high: yesterdayCandle.high,
      low: yesterdayCandle.low,
      close: yesterdayCandle.close,
    }, atrPct);

    // Calculate Tomorrow's CPR using today's OHLC
    const cprTomorrow = calculateCPR({
      high: todayCandle.high,
      low: todayCandle.low,
      close: todayCandle.close,
    }, atrPct);

    const tc = cprToday.tc;
    const bc = cprToday.bc;
    const ltp = stock.ltp;
    const _volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    // 2. Fetch Advanced Signals
    const signalData = SignalService.getSignals(stock, asOfDate);
    const signals = signalData.signals;

    // 3. Calculate Quant Score & Classification (uses cprToday values)
    const tempResult: Omit<ScannerSignalResult, 'score' | 'confidence'> = {
      ...stock,
      pivot: cprToday.pivot,
      bc,
      tc,
      r1: cprToday.r1,
      r2: cprToday.r2,
      r3: cprToday.r3,
      r4: cprToday.r4,
      s1: cprToday.s1,
      s2: cprToday.s2,
      s3: cprToday.s3,
      s4: cprToday.s4,
      width: cprToday.width,
      classification: cprToday.classification,
      signals,
      entry: 0,
      sl: 0,
      target: 0,
      rr: '1:1',
    };
    const score = RankingService.calculateScore(tempResult);

    // Advanced CPR Analytics
    const cprCompression = await CprCompressionService.getStats(stock);
    const distPivot = ((ltp - cprToday.pivot) / cprToday.pivot) * 100;

    let cprQuality: 'A+' | 'A' | 'B' | 'C' | undefined = undefined;

    // Feature Flag: Experimental CPR Quality Alignment Proxy
    if (process.env.ENABLE_EXPERIMENTAL_CPR_QUALITY === 'true') {
      // CPR Quality Score (Max 100)
      let cprScore = 0;
      // 1. Width (35%)
      if (cprToday.classification === 'NARROW') cprScore += 35;
      else if (cprToday.classification === 'NORMAL') cprScore += 17.5;
      // 2. Relationship (30%)
      const rel = compareCpr(cprToday, cprTomorrow);
      if (rel.isHigherValue || rel.isLowerValue) cprScore += 30;
      else if (rel.isInsideValue || rel.displayValue === 'OUTSIDE_VALUE') cprScore += 24; // 80% of 30
      else if (rel.isOverlappingValue) cprScore += 15; // 50% of 30
      // 3. Virgin (15%)
      const isVirgin = signals.includes('VIRGIN');
      if (isVirgin) cprScore += 15;
      // 4. Alignment (20%) - Proxied via last 5 days
      let weeklyTrend = cprToday.trend;
      if (stock.history && stock.history.length >= 5) {
        const slice = stock.history.slice(-5);
        const wHigh = Math.max(...slice.map(s => s.high));
        const wLow = Math.min(...slice.map(s => s.low));
        const wClose = slice[slice.length - 1].close;
        const wCpr = calculateCPR({ high: wHigh, low: wLow, close: wClose }, atrPct);
        weeklyTrend = wCpr.trend;
      }
      if (cprToday.trend === weeklyTrend) cprScore += 20;
      else if (cprToday.trend === 'Balanced' || weeklyTrend === 'Balanced') cprScore += 10;
      
      cprQuality = 'C';
      if (cprScore >= 90) cprQuality = 'A+';
      else if (cprScore >= 75) cprQuality = 'A';
      else if (cprScore >= 50) cprQuality = 'B';
    }

    // 4. Trade Setup V3 — Entry, SL, Target, RR (CPR Resistance/Support Targets)
    let entry = 0;
    let sl = 0;
    let target = 0;
    let rr = '1:2.0';

    // Determine bias from LTP vs TODAY's CPR band
    let bias: 'BULLISH' | 'BEARISH' | 'RANGE' = 'RANGE';
    if (ltp > cprToday.tc) bias = 'BULLISH';
    else if (ltp < cprToday.bc) bias = 'BEARISH';

    if (bias === 'BULLISH') {
      // LONG SETUP: entry at tomorrow's TC
      entry = cprTomorrow.tc;
      // SL = day low OR minimum 0.5% below entry (whichever is lower)
      const dayLowSL = stock.low;
      const minSL = entry * 0.995;
      sl = Math.min(dayLowSL, minSL);
      const risk = entry - sl;

      if (risk > 0) {
        // Find the first resistance level (R1 -> R2 -> R3 -> R4) that satisfies at least 1:1.5 RR
        const targets = [cprTomorrow.r1, cprTomorrow.r2, cprTomorrow.r3, cprTomorrow.r4];
        let chosenTarget = entry + risk * 1.5; // fallback
        for (const t of targets) {
          if (t > entry && (t - entry) / risk >= 1.5) {
            chosenTarget = t;
            break;
          }
        }
        target = chosenTarget;
        rr = `1:${((target - entry) / risk).toFixed(1)}`;
      } else {
        target = entry * 1.01;
        rr = '1:2.0';
      }
    } else if (bias === 'BEARISH') {
      // SHORT SETUP: entry at tomorrow's BC
      entry = cprTomorrow.bc;
      // SL = day high OR minimum 0.5% above entry (whichever is higher)
      const dayHighSL = stock.high;
      const maxSL = entry * 1.005;
      sl = Math.max(dayHighSL, maxSL);
      const risk = sl - entry;

      if (risk > 0) {
        // Find the first support level (S1 -> S2 -> S3 -> S4) that satisfies at least 1:1.5 RR
        const targets = [cprTomorrow.s1, cprTomorrow.s2, cprTomorrow.s3, cprTomorrow.s4];
        let chosenTarget = entry - risk * 1.5; // fallback
        for (const t of targets) {
          if (t < entry && (entry - t) / risk >= 1.5) {
            chosenTarget = t;
            break;
          }
        }
        target = chosenTarget;
        rr = `1:${((entry - target) / risk).toFixed(1)}`;
      } else {
        target = entry * 0.99;
        rr = '1:2.0';
      }
    } else {
      // RANGE SETUP
      entry = cprTomorrow.pivot;
      const isLongRange = ltp >= cprTomorrow.pivot;

      if (isLongRange) {
        sl = entry * 0.995;
        const risk = entry - sl;
        if (risk > 0) {
          const targets = [cprTomorrow.r1, cprTomorrow.r2, cprTomorrow.r3, cprTomorrow.r4];
          let chosenTarget = entry + risk * 1.5; // fallback
          for (const t of targets) {
            if (t > entry && (t - entry) / risk >= 1.5) {
              chosenTarget = t;
              break;
            }
          }
          target = chosenTarget;
          rr = `1:${((target - entry) / risk).toFixed(1)}`;
        } else {
          target = entry * 1.01;
          rr = '1:2.0';
        }
      } else {
        sl = entry * 1.005;
        const risk = sl - entry;
        if (risk > 0) {
          const targets = [cprTomorrow.s1, cprTomorrow.s2, cprTomorrow.s3, cprTomorrow.s4];
          let chosenTarget = entry - risk * 1.5; // fallback
          for (const t of targets) {
            if (t < entry && (entry - t) / risk >= 1.5) {
              chosenTarget = t;
              break;
            }
          }
          target = chosenTarget;
          rr = `1:${((entry - target) / risk).toFixed(1)}`;
        } else {
          target = entry * 0.99;
          rr = '1:2.0';
        }
      }
    }

    // 5. Confidence Score Calculation
    const confidence = this.calculateConfidence(tempResult);

    return {
      ...tempResult,
      score,
      confidence,
      entry: Number(entry.toFixed(2)),
      sl: Number(sl.toFixed(2)),
      target: Number(target.toFixed(2)),
      rr,
      tomorrowCPRProvisional: !isTodayCandleFinal,
      degenerateData,
      distPivot: Number(distPivot.toFixed(2)),
      cprCompression,
      cprQuality
    };
  }

  private static calculateConfidence(result: Omit<ScannerSignalResult, 'score' | 'confidence'>): number {
    const { signals, volume, avgVolume, width } = result;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    let confidence = 50; // base

    // 1. Liquidity / Volume Ratio (Max 20)
    if (volumeRatio >= 1.5) {
      confidence += 20;
    } else if (volumeRatio >= 1.2) {
      confidence += 12;
    } else if (volumeRatio >= 1.0) {
      confidence += 6;
    }

    // 2. CPR Width / Volatility (Max 20)
    if (width <= 0.1) {
      confidence += 20;
    } else if (width <= 0.25) {
      confidence += 12;
    } else if (width <= 0.5) {
      confidence += 8;
    } else if (width <= 1.0) {
      confidence += 4;
    } else {
      confidence += 0;
    }

    // 3. Signal Quality Synergy (Max 20)
    let synergy = 0;
    if (signals.includes('KGS_INSIDE_CPR') || signals.includes('KGS_RTP')) synergy += 10;
    if (signals.includes('VIRGIN')) synergy += 5;
    if (signals.includes('NARROW') && signals.includes('BREAKOUT')) synergy += 5;
    confidence += Math.min(20, synergy);

    // 4. Conflict Penalties
    let penalties = 0;
    if (signals.includes('KGS_ASC_CPR') && signals.includes('BEARISH')) penalties += 15;
    if (signals.includes('KGS_DESC_CPR') && signals.includes('BULLISH')) penalties += 15;
    if (signals.includes('KGS_OUTSIDE_CPR')) penalties += 15;

    confidence -= penalties;

    return Math.max(10, Math.min(confidence, 98));
  }
}

