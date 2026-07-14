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

export const LIQUIDITY = {
  MIN_HISTORY_FOR_RELIABLE_ATR: 15,
};

export const ATR = {
  BUILD_MULTIPLIER: 0.75,
  UNWIND_MULTIPLIER: 0.25,
};
