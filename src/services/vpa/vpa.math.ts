import { safeRatio } from '@/lib/math';
import type { VpaMarketInputs } from './vpa.types';

/** CLV in [-1, 1]: +1 = close at high, -1 = close at low. */
export function computeClv(close: number, high: number, low: number): number | null {
  const range = high - low;
  if (range <= 0) return null;
  return safeRatio((close - low) - (high - close), range, undefined) ?? null;
}

export function computeRvol(volume: number, avgVolume: number): number | null {
  if (!Number.isFinite(volume) || !Number.isFinite(avgVolume)) return null;
  if (avgVolume <= 0 || volume < 0) return null;
  return volume / avgVolume;
}

export function computeRangePct(high: number, low: number, close: number): number | null {
  if (close <= 0) return null;
  return safeRatio(high - low, close, undefined) ?? null;
}

export function computeWickRatios(
  open: number,
  high: number,
  low: number,
  close: number
): { upper: number | null; lower: number | null } {
  const range = high - low;
  if (range <= 0) return { upper: null, lower: null };
  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  return {
    upper: safeRatio(high - bodyTop, range, undefined) ?? null,
    lower: safeRatio(bodyBottom - low, range, undefined) ?? null,
  };
}

export function isBullishCandle(open: number, close: number): boolean {
  return close > open;
}

export function isBearishCandle(open: number, close: number): boolean {
  return close < open;
}

export function buildVpaInputs(
  direction: VpaMarketInputs['direction'],
  stock: {
    open: number;
    high: number;
    low: number;
    ltp?: number;
    close?: number;
    volume: number;
    avgVolume: number;
  },
  cpr: { bc: number; tc: number }
): VpaMarketInputs | null {
  const close = stock.ltp ?? stock.close ?? 0;
  
  // LTP can momentarily exceed the recorded candle high/low. Bounding prevents invalid CLV.
  const effectiveHigh = Math.max(stock.high, stock.open, close);
  const effectiveLow = Math.min(stock.low, stock.open, close);

  if (
    !Number.isFinite(close) ||
    close <= 0 ||
    !Number.isFinite(effectiveHigh) ||
    !Number.isFinite(effectiveLow) ||
    effectiveHigh < effectiveLow ||
    !Number.isFinite(stock.volume) ||
    !Number.isFinite(stock.avgVolume)
  ) {
    return null;
  }
  return {
    direction,
    open: stock.open,
    high: effectiveHigh,
    low: effectiveLow,
    close,
    volume: stock.volume,
    avgVolume: stock.avgVolume,
    todayBc: cpr.bc,
    todayTc: cpr.tc,
  };
}

export function sumBreakdown(values: Record<string, number>): number {
  return Object.values(values).reduce((s, v) => s + v, 0);
}

export function clampAdjustment(total: number, maxAbs: number): number {
  if (maxAbs <= 0) return 0;
  return Math.max(-maxAbs, Math.min(maxAbs, total));
}

export type BreakoutVpaStatus =
  | 'CONFIRMED'
  | 'ABSORPTION'
  | 'NO_DEMAND'
  | 'CLIMAX_REJECT'
  | 'NEUTRAL';

export interface BreakoutVpaFootprint {
  status: BreakoutVpaStatus;
  clv: number | null;
  rvol: number | null;
  label: string;
  badgeVariant: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  description: string;
  scoreModifier: number;
}

/**
 * Classifies the Volume-Price footprint of a breakout candle.
 */
export function classifyBreakoutVpa(
  rvol: number | null,
  clv: number | null,
  rangePct?: number | null
): BreakoutVpaFootprint {
  if (rvol === null || clv === null) {
    return {
      status: 'NEUTRAL',
      clv,
      rvol,
      label: 'Neutral',
      badgeVariant: 'neutral',
      description: 'Insufficient volume or range data for VPA evaluation',
      scoreModifier: 0,
    };
  }

  // 1. CLIMAX REJECT / UPPER WICK TRAP: High volume with weak close near low of the day
  if (rvol >= 1.5 && clv <= -0.2) {
    return {
      status: 'CLIMAX_REJECT',
      clv,
      rvol,
      label: 'Upper Wick Trap',
      badgeVariant: 'danger',
      description: `High volume (${rvol.toFixed(1)}x) with rejection near day low (CLV ${clv.toFixed(2)}) — indicates heavy institutional supply`,
      scoreModifier: -10,
    };
  }

  // 2. VOLUME CONFIRMED: Strong volume + strong close near high of the day
  if (rvol >= 1.5 && clv >= 0.3) {
    return {
      status: 'CONFIRMED',
      clv,
      rvol,
      label: 'Volume Confirmed',
      badgeVariant: 'success',
      description: `Volume-backed breakout (${rvol.toFixed(1)}x RVOL) closing strong near high (CLV ${clv.toFixed(2)})`,
      scoreModifier: 5,
    };
  }

  // 3. ABSORPTION: Solid volume on tight consolidation / accumulation
  if (rvol >= 1.2 && clv >= 0.0 && rangePct !== undefined && rangePct !== null && rangePct <= 0.025) {
    return {
      status: 'ABSORPTION',
      clv,
      rvol,
      label: 'Supply Absorption',
      badgeVariant: 'info',
      description: `Tight price action (${(rangePct * 100).toFixed(1)}% range) with above-average volume (${rvol.toFixed(1)}x) indicating institutional absorption`,
      scoreModifier: 5,
    };
  }

  // 4. NO DEMAND / LOW VOLUME: Volume dried up near highs
  if (rvol < 0.8) {
    return {
      status: 'NO_DEMAND',
      clv,
      rvol,
      label: 'Low Volume',
      badgeVariant: 'warning',
      description: `Low volume (${rvol.toFixed(1)}x RVOL) — lacking institutional buying participation`,
      scoreModifier: -3,
    };
  }

  // 5. Default NEUTRAL
  return {
    status: 'NEUTRAL',
    clv,
    rvol,
    label: 'Standard Flow',
    badgeVariant: 'neutral',
    description: `Moderate volume (${rvol.toFixed(1)}x RVOL) and balanced close (CLV ${clv.toFixed(2)})`,
    scoreModifier: 0,
  };
}
