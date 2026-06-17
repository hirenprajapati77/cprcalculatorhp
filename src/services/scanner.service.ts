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

    // 4. Trade Setup V3 — Entry, SL, Target, RR
    // SL is anchored to day's price range (min 0.5% buffer from entry).
    // Target is always RR 1:2 from actual SL distance — honest and consistent.
    let entry = 0;
    let sl = 0;
    let target = 0;

    // Determine bias from LTP vs CPR band
    let bias: 'BULLISH' | 'BEARISH' | 'RANGE' = 'RANGE';
    if (ltp > tc) bias = 'BULLISH';
    else if (ltp < bc) bias = 'BEARISH';

    if (bias === 'BULLISH') {
      // LONG SETUP: entry at tomorrow TC
      entry = tc;
      // SL = day low OR minimum 0.5% below entry (whichever is lower)
      const dayLowSL = stock.low;
      const minSL = entry * 0.995;
      sl = Math.min(dayLowSL, minSL);
      // Target = RR 1:2 from actual SL distance
      const slDistance = entry - sl;
      target = entry + (slDistance * 2);
    } else if (bias === 'BEARISH') {
      // SHORT SETUP: entry at tomorrow BC
      entry = bc;
      // SL = day high OR minimum 0.5% above entry (whichever is higher)
      const dayHighSL = stock.high;
      const maxSL = entry * 1.005;
      sl = Math.max(dayHighSL, maxSL);
      // Target = RR 1:2 from actual SL distance
      const slDistShort = sl - entry;
      target = entry - (slDistShort * 2);
    } else {
      // RANGE: entry at pivot, SL = 0.5% from entry, target = 2× SL distance
      entry = cpr.pivot;
      const rangeSL = entry * 0.995;
      sl = ltp >= cpr.pivot ? rangeSL : entry * 1.005;
      const riskRange = Math.abs(entry - sl);
      target = ltp >= cpr.pivot ? entry + (riskRange * 2) : entry - (riskRange * 2);
    }

    // RR is always 1:2.0 — clean, honest, consistent
    const rr = '1:2.0';

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

