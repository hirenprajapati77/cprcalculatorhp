// Configuration & Magic Numbers for Quant Platform

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

export const BTST_SCORING = {
  // Original continuous CLV multiplier
  CLV_CONTINUOUS_MULTIPLIER: 100,
  // Baseline static CLV multiplier
  CLV_BASE_MULTIPLIER: 75,
};

/** Advanced Engine (OvernightService) score scale — matches BtstRankingService / StbtRankingService. */
export const ADVANCED_SCORE = {
  MAX: 130,
  STRONG: 100,
  READY: 85,
  WATCH: 70,
} as const;

/** Legacy Simple / CPR scanner score scale (0–100). */
export const SIMPLE_SCORE = {
  MAX: 100,
  STRONG: 75,
  READY: 60,
  WATCH: 40,
} as const;

/** NSE cash-session open/close (IST). Sole home for these clock literals. */
export const MARKET_SESSION = {
  OPEN: { hour: 9, minute: 15 },
  CLOSE: { hour: 15, minute: 30 },
} as const;

/**
 * Canonical BTST / overnight IST windows (single source of truth).
 * End times are exclusive unless noted — e.g. discovery is open through minute before DISCOVERY_END_EXCLUSIVE.
 * Sole home for BTST clock hour/minute literals in the repo.
 */
export const BTST_WINDOWS = {
  /** Live discovery may run (UI + Advanced scan gate). */
  DISCOVERY_START: { hour: 15, minute: 10 },
  /** Confirmation / entry slice (ranking Rule 5 + Telegram primary). */
  CONFIRM_START: { hour: 15, minute: 20 },
  /** Exclusive end of discovery + confirm (freeze). */
  DISCOVERY_END_EXCLUSIVE: { hour: 15, minute: 25 },
  /** Journal cron after freeze, through market close (inclusive end). */
  JOURNAL_START: { hour: 15, minute: 25 },
  JOURNAL_END_INCLUSIVE: { hour: 15, minute: 30 },
  MARKET_CLOSE: MARKET_SESSION.CLOSE,
} as const;

export const LIQUIDITY = {
  MIN_HISTORY_FOR_RELIABLE_ATR: 15,
};

export const ATR = {
  BUILD_MULTIPLIER: 0.75,
  UNWIND_MULTIPLIER: 0.25,
};
