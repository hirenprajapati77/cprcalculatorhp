export type VpaDirection = 'LONG' | 'SHORT';

export interface VpaComponentBreakdown {
  rvol: number;
  clv: number;
  effortResult: number;
  breakoutConfirm: number;
  buyingClimax: number;
  sellingClimax: number;
  noDemand: number;
  noSupply: number;
}

export interface VpaConfirmationResult {
  /** Whether VPA was computed (false when disabled or insufficient data). */
  enabled: boolean;
  direction: VpaDirection;
  /** True when net adjustment is non-negative and no hard reject flags. */
  confirmed: boolean;
  /** Capped net adjustment (shadow unless live flags on). */
  adjustment: number;
  maxAdjustment: number;
  breakdown: VpaComponentBreakdown;
  /** Human-readable tags for UI / journal (e.g. VPA_BUYING_CLIMAX). */
  flags: string[];
  metrics: {
    rvol: number | null;
    clv: number | null;
    rangePct: number | null;
    upperWickRatio: number | null;
    lowerWickRatio: number | null;
  };
  /** Hard reject recommendation — only enforced when VPA_LIVE_GATES=true. */
  rejectRecommended: boolean;
  rejectReason: string | null;
}

export interface VpaMarketInputs {
  direction: VpaDirection;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  avgVolume: number;
  todayBc: number;
  todayTc: number;
}

export const EMPTY_VPA_BREAKDOWN: VpaComponentBreakdown = {
  rvol: 0,
  clv: 0,
  effortResult: 0,
  breakoutConfirm: 0,
  buyingClimax: 0,
  sellingClimax: 0,
  noDemand: 0,
  noSupply: 0,
};
