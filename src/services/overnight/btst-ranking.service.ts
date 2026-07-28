import { VOLUME_THRESHOLDS } from '@/config/trading-constants';
import { VpaConfirmationService, buildVpaInputs } from '@/services/vpa';
import { isVpaEnabled } from '@/config/vpa.config';
import type { VpaConfirmationResult } from '@/services/vpa';

export interface BtstScoringInputs {
  volume: number;
  avgVolume: number;
  /** Session open — optional; defaults to close when omitted (shadow-safe). */
  open?: number;
  /** True when tomorrow CPR is NARROW per classifyCprWidth (single source of truth). */
  tomorrowCprNarrow: boolean;
  tomorrowBc: number;
  tomorrowTc: number;   // needed for aligned higherValue condition
  todayBc: number;      // needed for aligned higherValue condition
  todayTc: number;
  close: number;
  high: number;
  low: number;
  vwap: number | null | undefined;
  intradayVolume: number | null | undefined;
  last15mHigh: number | null | undefined;
  hasConfirmationCandles: boolean;
  rsi14: number | null | undefined;
  emaCross: { cross: 'BULLISH' | 'BEARISH' | 'NONE'; isBullishAlignment: boolean } | null | undefined;
}

/** Per-rule points for Advanced BTST (max 130) — keys match Scanner explainability UI. */
export interface AdvancedScoreBreakdown {
  vdu: number;
  cprNarrow: number;
  higherValue: number;
  vwap: number;
  /** Rule 5: close vs last-15m extreme (UI label remains "Liquidity"). */
  liquidity: number;
  closeStrength: number;
  /** Rule 7 (SHADOW — not yet included in score): Trend Confluence */
  trendConfluence?: number;
}

export interface BtstScoreDetails {
  score: number | null;
  breakdown: AdvancedScoreBreakdown | null;
  /** Shadow VPA confirmation — does not affect score unless VPA live flags are on. */
  vpa?: VpaConfirmationResult | null;
}

export class BtstRankingService {
  /**
   * Calculates the quantitative BTST score (max 130) with per-rule breakdown.
   * Returns null score if INVALID due to missing inputs.
   */
  static calculateScoreDetails(inputs: BtstScoringInputs): BtstScoreDetails {
    // Score Safety: If required inputs are missing, return null (INVALID)
    if (
      inputs.vwap === undefined || inputs.vwap === null ||
      inputs.intradayVolume === undefined || inputs.intradayVolume === null || inputs.intradayVolume <= 0 ||
      inputs.last15mHigh === undefined || inputs.last15mHigh === null ||
      !inputs.hasConfirmationCandles
    ) {
      return { score: null, breakdown: null };
    }

    const breakdown: AdvancedScoreBreakdown = {
      vdu: 0,
      cprNarrow: 0,
      higherValue: 0,
      vwap: 0,
      liquidity: 0,
      closeStrength: 0,
      trendConfluence: 0,
    };

    // Rule 1: Strong VDU — score only at SPIKE_RATIO (2.0×).
    // Eligibility already gates at BREAKOUT_RATIO (1.5×); scoring at 2.0×
    // separates strong volume days within the eligible universe (Option B).
    if (inputs.avgVolume > 0 && inputs.volume >= VOLUME_THRESHOLDS.SPIKE_RATIO * inputs.avgVolume) {
      breakdown.vdu = 25;
    }

    // Rule 2: CPR Narrow — uses calculateCPR → classifyCprWidth (ATR-aware)
    if (inputs.tomorrowCprNarrow) {
      breakdown.cprNarrow = 30;
    }

    // Rule 3: Higher Value — tomorrowCpr BC and TC both above todayCpr BC and TC
    // (aligned with Simple Engine: partial overlap is OK, both edges must move up)
    if (inputs.tomorrowBc > inputs.todayBc && inputs.tomorrowTc > inputs.todayTc) {
      breakdown.higherValue = 20;
    }

    // Rule 4: Price Confirmation (Close > TC AND Close > VWAP)
    if (inputs.close > inputs.todayTc && inputs.close > inputs.vwap) {
      breakdown.vwap = 20;
    }

    // Rule 5: EOD Liquidity — close > highest price in 15:15–15:30 IST window
    if (inputs.close > inputs.last15mHigh) {
      breakdown.liquidity = 20;
    }

    // Rule 6: Closing Strength ((Close - Low) / (High - Low) > 0.70)
    const range = inputs.high - inputs.low;
    if (range > 0) {
      const closingStrength = (inputs.close - inputs.low) / range;
      if (closingStrength > 0.70) {
        breakdown.closeStrength = 15;
      }
    }

    // Rule 7 (SHADOW — not yet included in score total): Trend Confluence
    let trendConfluence = 0;
    if (inputs.rsi14 !== null && inputs.rsi14 !== undefined && inputs.emaCross) {
      const bullishTrend = inputs.emaCross.cross === 'BULLISH' || inputs.emaCross.isBullishAlignment;
      const supportiveRsi = inputs.rsi14 >= 50 && inputs.rsi14 <= 70; // RSI_STRONG band; exclude overbought
      const overbought = inputs.rsi14 > 70;
      if (bullishTrend && supportiveRsi) {
        trendConfluence = inputs.emaCross.cross === 'BULLISH' ? 15 : 5; // fresh cross > alignment-only
      } else if (bullishTrend && overbought) {
        trendConfluence = -10; // late-entry trap, same logic as scanner ranking.service.ts
      }
    }
    breakdown.trendConfluence = trendConfluence;

    const score =
      breakdown.vdu +
      breakdown.cprNarrow +
      breakdown.higherValue +
      breakdown.vwap +
      breakdown.liquidity +
      breakdown.closeStrength;

    let vpa: VpaConfirmationResult | null = null;
    if (isVpaEnabled()) {
      const vpaInputs = buildVpaInputs(
        'LONG',
        {
          open: inputs.open ?? inputs.close,
          high: inputs.high,
          low: inputs.low,
          close: inputs.close,
          volume: inputs.volume,
          avgVolume: inputs.avgVolume,
        },
        { bc: inputs.todayBc, tc: inputs.todayTc }
      );
      if (vpaInputs) {
        vpa = VpaConfirmationService.analyze(vpaInputs);
      }
    }

    return { score, breakdown, vpa };
  }

  /**
   * Calculates the quantitative BTST score (max 130).
   * Returns null if score is INVALID due to missing inputs.
   */
  static calculateScore(inputs: BtstScoringInputs): number | null {
    return this.calculateScoreDetails(inputs).score;
  }

  /**
   * Categorizes the signal based on the calculated score.
   */
  static getClassification(score: number | null): 'STRONG_BTST' | 'BTST_READY' | 'WATCH' | 'IGNORE' {
    if (score === null) return 'IGNORE';
    if (score >= 100) return 'STRONG_BTST';
    if (score >= 85) return 'BTST_READY';
    if (score >= 70) return 'WATCH';
    return 'IGNORE';
  }
}
