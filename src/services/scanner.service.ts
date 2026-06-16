import { calculateCPR } from '@/lib/cpr-engine';
import { MarketStockData } from './market.service';
import { SignalService } from './signal.service';
import { RankingService } from './ranking.service';

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
}


export class ScannerService {
  /**
   * Evaluates all CPR levels, price-action signals, entry targets, and SL parameters.
   */
  static scanStock(stock: MarketStockData): ScannerSignalResult {
    // 1. Calculate CPR levels using yesterday's OHLC
    const cpr = calculateCPR({
      high: stock.high,
      low: stock.low,
      close: stock.close,
    });

    const tc = cpr.tc;
    const bc = cpr.bc;
    const ltp = stock.ltp;
    const _volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    // 2. Fetch Advanced Signals
    const signalData = SignalService.getSignals(stock);
    const signals = signalData.signals;

    // 3. Calculate Quant Score & Classification
    // Create temporary object to calculate score
    const tempResult: Omit<ScannerSignalResult, 'score' | 'confidence'> = {
      ...stock,
      pivot: cpr.pivot,
      bc,
      tc,
      r1: cpr.r1,
      r2: cpr.r2,
      r3: cpr.r3,
      r4: cpr.r4,
      s1: cpr.s1,
      s2: cpr.s2,
      s3: cpr.s3,
      s4: cpr.s4,
      width: cpr.width,
      classification: cpr.classification,
      signals,
      entry: 0,
      sl: 0,
      target: 0,
      rr: '1:1',
    };
    const score = RankingService.calculateScore(tempResult);

    // 4. Trade Setup (Entry, SL, Target, RR) & Confidence Calculations
    let entry = 0;
    let sl = 0;
    let target = 0;
    let rrRatio = 1.0;
    let bias: 'BULLISH' | 'BEARISH' | 'RANGE' = 'RANGE';

    if (ltp > tc) {
      bias = 'BULLISH';
    } else if (ltp < bc) {
      bias = 'BEARISH';
    }

    if (bias === 'BULLISH') {
      entry = tc;
      sl = bc;
      target = cpr.r2; // Target range ceiling R2
      const risk = entry - sl;
      const reward = target - entry;
      rrRatio = risk > 0 ? reward / risk : 1.0;
    } else if (bias === 'BEARISH') {
      entry = bc;
      sl = tc;
      target = cpr.s2; // Target range ceiling S2
      const risk = sl - entry;
      const reward = entry - target;
      rrRatio = risk > 0 ? reward / risk : 1.0;
    } else {
      // Rangebound mean reversion: entry at pivot, SL at extremes
      entry = cpr.pivot;
      if (ltp >= cpr.pivot) {
        sl = cpr.s1;
        target = cpr.r1;
      } else {
        sl = cpr.r1;
        target = cpr.s1;
      }
      const risk = Math.abs(entry - sl);
      const reward = Math.abs(target - entry);
      rrRatio = risk > 0 ? reward / risk : 1.0;
    }

    const rr = `1:${rrRatio.toFixed(1)}`;

    // 5. Confidence Score Calculation
    let confidence = score;
    confidence = Math.min(confidence, 98); // Max cap at 98%

    return {
      ...stock,
      pivot: cpr.pivot,
      bc,
      tc,
      r1: cpr.r1,
      r2: cpr.r2,
      r3: cpr.r3,
      r4: cpr.r4,
      s1: cpr.s1,
      s2: cpr.s2,
      s3: cpr.s3,
      s4: cpr.s4,
      width: cpr.width,
      classification: cpr.classification,
      signals,
      score,
      entry,
      sl,
      target,
      rr,
      confidence,
    };
  }
}

