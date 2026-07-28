import {
  isVpaEnabled,
  isVpaLiveConfidenceEnabled,
  isVpaLiveGatesEnabled,
  VPA_LIMITS,
} from '@/config/vpa.config';
import { scoreVpaBreakoutConfirm } from './breakout-confirm.service';
import { shouldRejectBuyingClimax, scoreVpaClimax } from './climax.service';
import { scoreVpaClv } from './clv.service';
import { scoreVpaEffortResult } from './effort-result.service';
import { shouldRejectNoDemand, scoreVpaNoDemandSupply } from './no-demand-supply.service';
import { scoreVpaRvol } from './rvol.service';
import { clampAdjustment, sumBreakdown, buildVpaInputs } from './vpa.math';
import {
  EMPTY_VPA_BREAKDOWN,
  type VpaConfirmationResult,
  type VpaMarketInputs,
} from './vpa.types';

export class VpaConfirmationService {
  /**
   * Pure VPA confirmation analysis — never mutates CPR/BTST base score.
   * Safe to call from ranking, scanner, journal, and backtest paths.
   */
  static analyze(inputs: VpaMarketInputs): VpaConfirmationResult {
    if (!isVpaEnabled()) {
      return VpaConfirmationService.disabledResult(inputs.direction);
    }

    const rvolPart = scoreVpaRvol(inputs.volume, inputs.avgVolume);
    const clvPart = scoreVpaClv(inputs.direction, inputs.close, inputs.high, inputs.low);
    const effortPart = scoreVpaEffortResult(
      inputs.volume,
      inputs.avgVolume,
      inputs.high,
      inputs.low,
      inputs.close
    );
    const breakoutPart = scoreVpaBreakoutConfirm(inputs);
    const climaxPart = scoreVpaClimax(inputs);
    const demandPart = scoreVpaNoDemandSupply(inputs);

    const breakdown = {
      rvol: rvolPart.points,
      clv: clvPart.points,
      effortResult: effortPart.points,
      breakoutConfirm: breakoutPart.points,
      buyingClimax: climaxPart.buyingClimax,
      sellingClimax: climaxPart.sellingClimax,
      noDemand: demandPart.noDemand,
      noSupply: demandPart.noSupply,
    };

    const flags = [
      rvolPart.flag,
      clvPart.flag,
      effortPart.flag,
      breakoutPart.flag,
      ...climaxPart.flags,
      ...demandPart.flags,
    ].filter((f): f is string => Boolean(f));

    const rawTotal = sumBreakdown(breakdown);
    const adjustment = clampAdjustment(rawTotal, VPA_LIMITS.MAX_ADJUSTMENT);

    const rejectForClimax = shouldRejectBuyingClimax(inputs.direction, flags);
    const rejectForNoDemand = shouldRejectNoDemand(inputs.direction, flags);
    const rejectRecommended = rejectForClimax || rejectForNoDemand;
    const rejectReason = rejectForClimax
      ? 'Buying climax detected — volume not confirming sustainable breakout'
      : rejectForNoDemand
        ? inputs.direction === 'LONG'
          ? 'No demand — up candle on low volume / narrow spread'
          : 'No supply — down candle on low volume / narrow spread'
        : null;

    const hardRejectActive = isVpaLiveGatesEnabled() && rejectRecommended;
    const live = isVpaLiveConfidenceEnabled() || isVpaLiveGatesEnabled();

    return {
      enabled: true,
      direction: inputs.direction,
      confirmed: adjustment >= 0 && !hardRejectActive,
      adjustment,
      maxAdjustment: VPA_LIMITS.MAX_ADJUSTMENT,
      breakdown,
      flags,
      metrics: {
        rvol: rvolPart.rvol,
        clv: clvPart.clv,
        rangePct: effortPart.rangePct,
        upperWickRatio: climaxPart.upperWickRatio,
        lowerWickRatio: climaxPart.lowerWickRatio,
      },
      rejectRecommended,
      rejectReason,
      live,
    };
  }

  /** Apply capped confidence delta — only when VPA_LIVE_CONFIDENCE is enabled. */
  static applyConfidenceDelta(baseConfidence: number, vpa: VpaConfirmationResult | null | undefined): number {
    // Defense in depth: callers should also gate, but never apply live deltas in shadow mode.
    if (!isVpaLiveConfidenceEnabled()) return baseConfidence;
    if (!vpa?.enabled || vpa.adjustment === 0) return baseConfidence;
    // Half-weight for confidence bar (0–100 scale)
    const delta = Math.round(vpa.adjustment * 0.5);
    return Math.max(0, Math.min(100, baseConfidence + delta));
  }

  /** Convenience wrapper for journal / backtest paths that already have MarketStockData + CPR. */
  static analyzeFromStock(
    stock: {
      open: number;
      high: number;
      low: number;
      ltp?: number;
      close?: number;
      volume: number;
      avgVolume: number;
    },
    direction: VpaMarketInputs['direction'],
    cpr: { bc: number; tc: number }
  ): VpaConfirmationResult | null {
    const inputs = buildVpaInputs(direction, stock, cpr);
    return inputs ? this.analyze(inputs) : null;
  }

  private static disabledResult(direction: VpaMarketInputs['direction']): VpaConfirmationResult {
    return {
      enabled: false,
      direction,
      confirmed: true,
      adjustment: 0,
      maxAdjustment: VPA_LIMITS.MAX_ADJUSTMENT,
      breakdown: { ...EMPTY_VPA_BREAKDOWN },
      flags: [],
      metrics: {
        rvol: null,
        clv: null,
        rangePct: null,
        upperWickRatio: null,
        lowerWickRatio: null,
      },
      rejectRecommended: false,
      rejectReason: null,
      live: false,
    };
  }
}

export { buildVpaInputs } from './vpa.math';
