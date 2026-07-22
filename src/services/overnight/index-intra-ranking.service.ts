/**
 * Index INTRA scoring — 0–100 scale with symmetric bearish rules.
 * Replaces stock RankingService for index intraday (no volume category;
 * session-move points instead).
 */
import { SIMPLE_SCORE } from '@/config/trading-constants';
import { IndexClassification } from './index-ranking.service';

/** INTRA classification floors — SIMPLE_SCORE scale (0–100 max). */
export const INDEX_INTRA_SCORE = {
  MAX: SIMPLE_SCORE.MAX,
  STRONG: SIMPLE_SCORE.STRONG,
  READY: SIMPLE_SCORE.READY,
  WATCH: SIMPLE_SCORE.WATCH,
} as const;

/** Session move thresholds for Category B (aligned with direction). */
const SESSION_MOVE_STRONG = 0.01; // 1.0%
const SESSION_MOVE_MODERATE = 0.005; // 0.5%

export class IndexIntraRankingService {
  /**
   * Score index INTRA setups on a 0–100 scale.
   *
   * Category A — CPR structure (max 45): symmetric bull/bear value + breakdown.
   * Category B — Session move (max 25): replaces volume for spot indices.
   * Category C — Momentum & trend (max 20).
   * Category D — Hot zone & RTP (max 10).
   */
  static calculateScore(
    signals: string[],
    direction: 'LONG' | 'SHORT',
    sessionMovePct: number
  ): number {
    // Category A: CPR Structure (max 45)
    let catASum = 0;
    if (signals.includes('NARROW')) catASum += 15;
    if (signals.includes('HIGHER_VALUE') || signals.includes('INSIDE_VALUE')) catASum += 10;
    if (signals.includes('LOWER_VALUE')) catASum += 10;
    if (
      signals.includes('BREAKOUT') ||
      signals.includes('LONG_BUILD') ||
      signals.includes('BREAKDOWN') ||
      signals.includes('SHORT_BUILD')
    ) {
      catASum += 10;
    }
    if (signals.includes('KGS_INSIDE_CPR')) catASum += 10;
    if (signals.includes('VIRGIN')) catASum += 5;
    if (
      (signals.includes('KGS_ASC_CPR') && signals.includes('BULLISH')) ||
      (signals.includes('KGS_DESC_CPR') && signals.includes('BEARISH'))
    ) {
      catASum += 5;
    }
    const catA = Math.min(45, catASum);

    // Category B: Session move aligned with direction (max 25)
    let catBSum = 0;
    const alignedMove =
      (direction === 'LONG' && sessionMovePct > 0) ||
      (direction === 'SHORT' && sessionMovePct < 0);
    if (alignedMove) {
      const absMove = Math.abs(sessionMovePct);
      if (absMove >= SESSION_MOVE_STRONG) catBSum += 15;
      else if (absMove >= SESSION_MOVE_MODERATE) catBSum += 10;
    }
    const catB = Math.min(25, catBSum);

    // Category C: Momentum & trend (max 20)
    let catCSum = 0;
    if (signals.includes('MOMENTUM')) catCSum += 10;
    if (signals.includes('NORMAL') && (signals.includes('BULLISH') || signals.includes('BEARISH'))) {
      catCSum += 10;
    }
    const catC = Math.min(20, catCSum);

    // Category D: Hot zone & RTP (max 10)
    let catDSum = 0;
    if (signals.includes('HOT_ZONE')) catDSum += 5;
    if (signals.includes('NARROW') && signals.includes('KGS_RTP')) catDSum += 5;
    const catD = Math.min(10, catDSum);

    let score = catA + catB + catC + catD;

    if (signals.includes('KGS_ASC_CPR') && signals.includes('BEARISH')) score -= 10;
    if (signals.includes('KGS_DESC_CPR') && signals.includes('BULLISH')) score -= 10;
    if (signals.includes('KGS_OUTSIDE_CPR')) score -= 10;

    return Math.max(0, Math.min(score, INDEX_INTRA_SCORE.MAX));
  }

  static getClassification(score: number): IndexClassification {
    if (score >= INDEX_INTRA_SCORE.STRONG) return 'INDEX_STRONG';
    if (score >= INDEX_INTRA_SCORE.READY) return 'INDEX_READY';
    if (score >= INDEX_INTRA_SCORE.WATCH) return 'INDEX_WATCH';
    return 'IGNORE';
  }
}
