/**
 * VPA (Volume Price Analysis) configuration — confirmation layer only.
 * Defaults: enabled + shadow mode so existing scores/classifications are unchanged.
 */
import { env } from '@/config/env';
import { ADVANCED_SCORE, VOLUME_THRESHOLDS } from '@/config/trading-constants';

function envFlag(name: string, defaultTrue = true): boolean {
  const fromProcess = process.env[name];
  const raw =
    fromProcess !== undefined && fromProcess !== null && String(fromProcess).trim() !== ''
      ? fromProcess
      : (env as Record<string, string | number | boolean | undefined>)[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultTrue;
  }
  return String(raw).toLowerCase() === 'true';
}

/** Master switch — when false, VPA is not computed anywhere. */
export function isVpaEnabled(): boolean {
  return envFlag('VPA_ENABLED', true);
}

/** When true (default), VPA never mutates live score, classification, or journal gates. */
export function isVpaShadowMode(): boolean {
  return envFlag('VPA_SHADOW_MODE', true);
}

/** When true, scanner confidence may incorporate capped VPA adjustment. */
export function isVpaLiveConfidenceEnabled(): boolean {
  return envFlag('VPA_LIVE_CONFIDENCE', false);
}

/** When true, EntryManager may hard-reject on severe VPA flags (climax / no demand). */
export function isVpaLiveGatesEnabled(): boolean {
  return envFlag('VPA_LIVE_GATES', false);
}

export const VPA_LIMITS = {
  /** Max absolute adjustment vs Advanced 130pt scale (~15%). */
  MAX_ADJUSTMENT: Math.round(ADVANCED_SCORE.MAX * 0.15),
  /** Lookback for RVOL denominator (matches avgVolume convention). */
  RVOL_LOOKBACK_DAYS: 20,
} as const;

export const VPA_RVOL = {
  STRONG: env.VPA_RVOL_STRONG ? Number(env.VPA_RVOL_STRONG) : VOLUME_THRESHOLDS.SPIKE_RATIO,
  GOOD: env.VPA_RVOL_GOOD ? Number(env.VPA_RVOL_GOOD) : VOLUME_THRESHOLDS.BREAKOUT_RATIO,
  WEAK: env.VPA_RVOL_WEAK ? Number(env.VPA_RVOL_WEAK) : 1.0,
  /** Shadow adjustment points (smaller than raw VDU to avoid double-counting). */
  STRONG_ADJ: 5,
  GOOD_ADJ: 3,
  WEAK_PENALTY: -5,
} as const;

export const VPA_CLV = {
  BULLISH: 0.7,
  BEARISH: 0.3,
  BULLISH_ADJ: 3,
  BEARISH_ADJ: -3,
  NEUTRAL_PENALTY: -1,
} as const;

export const VPA_EFFORT = {
  /** RVOL above this triggers effort/result logic. */
  HIGH_EFFORT_RVOL: 2.0,
  /** Day range as fraction of close — below = tiny candle (absorption risk). */
  TINY_RANGE_PCT: 0.005,
  /** Day range as fraction of close — above = strong expansion. */
  LARGE_RANGE_PCT: 0.015,
  ABSORPTION_PENALTY: -5,
  CONFIRMATION_BONUS: 4,
} as const;

export const VPA_CLIMAX = {
  EXTREME_RVOL: 2.5,
  /** Upper/lower wick must be at least this fraction of day range. */
  WICK_RATIO: 0.4,
  BUYING_PENALTY: -8,
  SELLING_REVERSAL_BONUS: 3,
} as const;

export const VPA_NO_DEMAND_SUPPLY = {
  LOW_RVOL: 0.8,
  /** Narrow spread: range/close below this fraction. */
  NARROW_SPREAD_PCT: 0.008,
  NO_DEMAND_PENALTY: -5,
  NO_SUPPLY_BULL_BONUS: 3,
  NO_SUPPLY_SHORT_PENALTY: -5,
} as const;

export const VPA_BREAKOUT = {
  CONFIRMED_ADJ: 3,
  WEAK_PENALTY: -2,
  CLV_MIN_BULL: 0.5,
  CLV_MAX_BEAR: -0.5,
} as const;

export const VPA_COMPONENT_FLAGS = {
  rvol: envFlag('VPA_COMPONENT_RVOL', true),
  clv: envFlag('VPA_COMPONENT_CLV', true),
  effortResult: envFlag('VPA_COMPONENT_EFFORT', true),
  breakoutConfirm: envFlag('VPA_COMPONENT_BREAKOUT', true),
  climax: envFlag('VPA_COMPONENT_CLIMAX', true),
  noDemandSupply: envFlag('VPA_COMPONENT_NO_DEMAND_SUPPLY', true),
} as const;
