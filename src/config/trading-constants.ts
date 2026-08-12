// Configuration & Magic Numbers for Quant Platform

import { getActiveMarketProfile } from '@/config/market-profile';

const activeProfile = getActiveMarketProfile();

export const CPR_THRESHOLDS = {
  QUALITY_A_PLUS: 90,
  QUALITY_A: 75,
  QUALITY_B: 50,
};

export const VOLUME_THRESHOLDS = {
  SPIKE_RATIO: 2.0,
  BREAKOUT_RATIO: 1.5,
  STRONG_RATIO: 1.2,
};

/** Intraday BREAKOUT/BREAKDOWN confirmation (see src/lib/breakout-confirm.ts). */
export const BREAKOUT_CONFIRMATION = {
  /** Gap continuation (never traded TC/BC) must hold this long. */
  HOLD_MINUTES: 10,
  /** Session reclaim (traded through level) must still hold this long — anti-flicker. */
  RECLAIM_HOLD_MINUTES: 5,
} as const;

/**
 * India VIX regime for automated CPR breakout Telegram alerts (cron-only).
 * Aligns pause threshold with overnight INDIA_VIX_ELEVATED_MIN (25).
 */
export const BREAKOUT_VIX = {
  /** Pause all automated breakout alerts when latest India VIX close >= this. */
  PAUSE_ALERTS_MIN: 25,
  /** Tighten entry chase + minimum score when VIX is elevated but below pause. */
  TIGHTEN_MIN: 18,
  /** Stricter entry-chase cap (%) in the tighten band (default gate uses 3.5%). */
  TIGHTENED_ENTRY_EXTENSION_PCT: 2.0,
  /** Minimum scanner score to alert in the tighten band. */
  TIGHTEN_MIN_SCORE: 85,
} as const;

export const BTST_SCORING = {
  // Original continuous CLV multiplier
  CLV_CONTINUOUS_MULTIPLIER: 100,
  // Baseline static CLV multiplier
  CLV_BASE_MULTIPLIER: 75,
  // NARROW-CPR / virgin-session weight for the simple (research) score helpers.
  // NO_VDU is heavier because the no_vdu_weighted variant drops the +20 volume leg.
  CPR_NARROW_WEIGHT: 15,
  CPR_NARROW_WEIGHT_NO_VDU: 35,
};

/** Advanced Engine (OvernightService) score scale — matches BtstRankingService / StbtRankingService. */
export const ADVANCED_SCORE = {
  MAX: 130,
  STRONG: 100,
  READY: 85,
  WATCH: 70,
} as const;

/**
 * Index regime confidence modifiers (Phase 1 — boost/penalty only, no hard blocks).
 * Applied on top of base CPR score to produce `confidence`.
 */
export const INDEX_REGIME = {
  ALIGNED_BOOST: 10,
  COUNTER_PENALTY: -15,
  HIGH_VOL_PENALTY: -5,
} as const;

/** Legacy Simple / CPR scanner score scale (0–100). */
export const SIMPLE_SCORE = {
  MAX: 100,
  STRONG: 75,
  READY: 60,
  WATCH: 40,
} as const;

/**
 * NSE cash-session clock (IST). Built from the active MarketProfile
 * (default CONTINUOUS = exact prior production values).
 */
export const MARKET_SESSION = {
  /** Pre-session / pre-open window start (order book / prep). */
  PRE_OPEN: activeProfile.preOpen,
  /** Live cash-market open. */
  OPEN: activeProfile.cashOpen,
  /** Live cash continuous close (exclusive end for isMarketOpen). */
  CLOSE: activeProfile.cashContinuousEnd,
} as const;

/**
 * Canonical BTST / overnight IST windows (single source of truth).
 * End times are exclusive unless noted — e.g. discovery is open through minute before DISCOVERY_END_EXCLUSIVE.
 * Derived from active MarketProfile — do not scatter hour/minute literals elsewhere.
 */
export const BTST_WINDOWS = {
  /** Live discovery may run (UI + Advanced scan gate). */
  DISCOVERY_START: activeProfile.discoveryStart,
  /** EOD liquidity / Rule 5 window start (profile Rule5 window). */
  CLOSING_WINDOW_START: activeProfile.rule5Start,
  /** Exclusive end of Rule 5 / closing-liquidity window (must match profile.rule5EndExclusive). */
  RULE5_END_EXCLUSIVE: activeProfile.rule5EndExclusive,
  /** Confirmation / entry slice (ranking Rule 5 + journal primary). */
  CONFIRM_START: activeProfile.confirmStart,
  /** Exclusive end of discovery + confirm (freeze). */
  DISCOVERY_END_EXCLUSIVE: activeProfile.discoveryEndExclusive,
  /** Journal cron after freeze (inclusive end). */
  JOURNAL_START: activeProfile.btstJournalStart,
  JOURNAL_END_INCLUSIVE: activeProfile.btstJournalEndInclusive,
  MARKET_CLOSE: MARKET_SESSION.CLOSE,
} as const;

/**
 * CPR journal cron IST window (distinct from BTST_WINDOWS).
 * Compared as HHMM integers: hour * 100 + minute (inclusive both ends).
 * Under CONTINUOUS: 15:20–15:24 (production). Under CLOSING_AUCTION: after casEnd.
 */
export const CPR_JOURNAL_WINDOW = {
  START_HHMM: activeProfile.cprJournalStartHhmm,
  END_HHMM: activeProfile.cprJournalEndHhmm,
} as const;

export const LIQUIDITY = {
  MIN_HISTORY_FOR_RELIABLE_ATR: 15,
};

export const ATR = {
  BUILD_MULTIPLIER: 0.75,
  UNWIND_MULTIPLIER: 0.25,
};
