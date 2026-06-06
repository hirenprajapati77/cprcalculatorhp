import { calculateCPR } from '@/lib/cpr-engine';
import { MarketStockData } from './market.service';

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
  entry: number;
  sl: number;
  target: number;
  rr: string; // Risk-Reward ratio, e.g. "1:2.5"
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

    const signals: string[] = [];
    const ltp = stock.ltp;
    const tc = cpr.tc;
    const bc = cpr.bc;
    const volumeRatio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 1;

    // 2. Evaluate Signals
    // Width Classification
    if (cpr.classification === 'NARROW') {
      signals.push('NARROW');
    } else if (cpr.classification === 'WIDE') {
      signals.push('WIDE');
    } else {
      signals.push('NORMAL');
    }

    // Bullish / Bearish / Inside
    let bias: 'BULLISH' | 'BEARISH' | 'RANGE' = 'RANGE';
    if (ltp > tc) {
      signals.push('BULLISH');
      bias = 'BULLISH';
    } else if (ltp < bc) {
      signals.push('BEARISH');
      bias = 'BEARISH';
    } else {
      signals.push('INSIDE');
      bias = 'RANGE';
    }

    // Gap Up / Gap Down
    if (stock.open > stock.high) {
      signals.push('GAP_UP');
    } else if (stock.open < stock.low) {
      signals.push('GAP_DOWN');
    }

    // Virgin CPR
    const todayMinPrice = Math.min(stock.open, ltp);
    const todayMaxPrice = Math.max(stock.open, ltp);
    if (todayMinPrice > tc || todayMaxPrice < bc) {
      signals.push('VIRGIN');
    }

    // Volume Spike
    if (volumeRatio >= 2.0) {
      signals.push('VOLUME_SPIKE');
    }

    // Breakout (Volume Spike + Bullish Break of CPR)
    if (volumeRatio >= 1.5 && ltp > tc) {
      signals.push('BREAKOUT');
    }

    // Momentum
    if (ltp > cpr.r1 || ltp < cpr.s1) {
      signals.push('MOMENTUM');
    }

    // 3. Trade Setup (Entry, SL, Target, RR) Calculations
    let entry = 0;
    let sl = 0;
    let target = 0;
    let rrRatio = 1.0;

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

    // Format risk-reward string e.g. "1:2.5"
    const rr = `1:${rrRatio.toFixed(1)}`;

    return {
      ...stock,
      pivot: cpr.pivot,
      bc: cpr.bc,
      tc: cpr.tc,
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
      entry,
      sl,
      target,
      rr,
    };
  }
}
