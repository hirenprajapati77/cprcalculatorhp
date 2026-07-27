import { safeRatio } from '@/lib/math';
import type { VpaMarketInputs } from './vpa.types';

/** CLV in [-1, 1]: +1 = close at high, -1 = close at low. */
export function computeClv(close: number, high: number, low: number): number | null {
  const range = high - low;
  if (range <= 0) return null;
  return safeRatio((close - low) - (high - close), range, null);
}

export function computeRvol(volume: number, avgVolume: number): number | null {
  if (avgVolume <= 0 || volume < 0) return null;
  return volume / avgVolume;
}

export function computeRangePct(high: number, low: number, close: number): number | null {
  if (close <= 0) return null;
  return safeRatio(high - low, close, null);
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
    upper: safeRatio(high - bodyTop, range, null),
    lower: safeRatio(bodyBottom - low, range, null),
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
  if (
    !Number.isFinite(close) ||
    close <= 0 ||
    !Number.isFinite(stock.high) ||
    !Number.isFinite(stock.low) ||
    stock.high < stock.low
  ) {
    return null;
  }
  return {
    direction,
    open: stock.open,
    high: stock.high,
    low: stock.low,
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
