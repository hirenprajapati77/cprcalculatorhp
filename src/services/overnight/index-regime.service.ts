/**
 * Index regime integration — wraps RegimeService with configurable confidence
 * boost/penalty for CALL BUY / PUT BUY signals. Does not hard-block trades.
 */
import { INDEX_REGIME } from '@/config/trading-constants';
import { MarketRegime, RegimeService } from './regime.service';

export interface IndexRegimeContext {
  trend: MarketRegime['trend'];
  volatility: MarketRegime['volatility'];
  /** Points added to base score to produce confidence. */
  adjustment: number;
  reason: string;
}

export class IndexRegimeService {
  static async getMarketRegime(date: string): Promise<MarketRegime> {
    return RegimeService.getMarketRegime(date);
  }

  /**
   * Compute confidence adjustment from broad NIFTY regime vs signal direction.
   */
  static computeAdjustment(
    direction: 'LONG' | 'SHORT',
    regime: MarketRegime
  ): IndexRegimeContext {
    let adjustment = 0;
    const parts: string[] = [];

    if (direction === 'LONG' && regime.trend === 'BULL') {
      adjustment += INDEX_REGIME.ALIGNED_BOOST;
      parts.push('NIFTY bullish trend — CALL aligned (+10)');
    } else if (direction === 'LONG' && regime.trend === 'BEAR') {
      adjustment += INDEX_REGIME.COUNTER_PENALTY;
      parts.push('NIFTY bearish trend — CALL counter-trend (−15)');
    } else if (direction === 'SHORT' && regime.trend === 'BEAR') {
      adjustment += INDEX_REGIME.ALIGNED_BOOST;
      parts.push('NIFTY bearish trend — PUT aligned (+10)');
    } else if (direction === 'SHORT' && regime.trend === 'BULL') {
      adjustment += INDEX_REGIME.COUNTER_PENALTY;
      parts.push('NIFTY bullish trend — PUT counter-trend (−15)');
    } else {
      parts.push('NIFTY choppy — neutral regime adjustment');
    }

    if (regime.volatility === 'HIGH') {
      adjustment += INDEX_REGIME.HIGH_VOL_PENALTY;
      parts.push('High volatility — confidence reduced (−5)');
    }

    return {
      trend: regime.trend,
      volatility: regime.volatility,
      adjustment,
      reason: parts.join('; '),
    };
  }

  static applyConfidence(
    baseScore: number | null,
    adjustment: number,
    maxScore: number
  ): number | null {
    if (baseScore === null) return null;
    return Math.max(0, Math.min(maxScore, baseScore + adjustment));
  }
}
