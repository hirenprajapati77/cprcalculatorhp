import { MarketBreadthService } from './market-breadth.service';
import { MultiYearBreakoutService } from './multi-year-breakout.service';
import { PatternBreakoutService } from './pattern-breakout.service';
import { MomentumLeadersService } from './momentum-leaders.service';

/**
 * Background batch runner to precompute all Market Tools reports sequentially.
 * Saves outputs into Redis with 24-hour TTLs.
 * Must NEVER run directly inside an HTTP web request.
 */
export async function runMarketToolsPrecomputeJob(): Promise<{
  success: boolean;
  breadthDate?: string;
  multiYearCount?: number;
  patternCount?: number;
  momentumCount?: number;
  elapsedMs: number;
}> {
  const startTime = Date.now();
  console.log('[MarketToolsPrecomputeJob] Starting background pre-computation pass...');

  try {
    let breadthDate: string | undefined;
    let multiYearCount: number | undefined;
    let patternCount: number | undefined;
    let momentumCount: number | undefined;

    try {
      // 1. Market Breadth
      const breadth = await MarketBreadthService.getMarketBreadth(true);
      console.log(`[MarketToolsPrecomputeJob] Breadth completed for date ${breadth.date} (Overall Score: ${breadth.overallScore})`);
      breadthDate = breadth.date;
    } catch (err) {
      console.error('[MarketToolsPrecomputeJob] Failed Market Breadth:', err);
    }

    try {
      // 2. Multi-Year Breakout
      const multiYear = await MultiYearBreakoutService.getBreakoutReport(true);
      console.log(`[MarketToolsPrecomputeJob] Multi-Year Breakout completed (${multiYear.stocks.length} candidates)`);
      multiYearCount = multiYear.stocks.length;
    } catch (err) {
      console.error('[MarketToolsPrecomputeJob] Failed Multi-Year Breakout:', err);
    }

    try {
      // 3. 52W Pattern Breakout
      const pattern = await PatternBreakoutService.getPatternBreakoutReport(true);
      console.log(`[MarketToolsPrecomputeJob] Pattern Breakout completed (${pattern.qualifiedCount} candidates)`);
      patternCount = pattern.qualifiedCount;
    } catch (err) {
      console.error('[MarketToolsPrecomputeJob] Failed Pattern Breakout:', err);
    }

    try {
      // 4. Momentum Leaders
      const momentum = await MomentumLeadersService.getMomentumLeadersReport(true);
      console.log(`[MarketToolsPrecomputeJob] Momentum Leaders completed (${momentum.qualifiedCount} candidates)`);
      momentumCount = momentum.qualifiedCount;
    } catch (err) {
      console.error('[MarketToolsPrecomputeJob] Failed Momentum Leaders:', err);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[MarketToolsPrecomputeJob] Pre-computation completed in ${elapsedMs}ms`);

    // Require ALL sub-jobs to succeed so scheduler retries on partial failures
    const allSucceeded = breadthDate !== undefined && multiYearCount !== undefined && patternCount !== undefined && momentumCount !== undefined;
    if (!allSucceeded) {
      const failed = [
        breadthDate === undefined && 'Breadth',
        multiYearCount === undefined && 'Multi-Year Breakout',
        patternCount === undefined && 'Pattern Breakout',
        momentumCount === undefined && 'Momentum Leaders',
      ].filter(Boolean).join(', ');
      console.error(`[MarketToolsPrecomputeJob] Partial failure — sub-jobs failed: ${failed}. Reporting failure so the scheduler can retry.`);
    }

    return {
      success: allSucceeded,
      ...(breadthDate !== undefined && { breadthDate }),
      ...(multiYearCount !== undefined && { multiYearCount }),
      ...(patternCount !== undefined && { patternCount }),
      ...(momentumCount !== undefined && { momentumCount }),
      elapsedMs,
    };
  } catch (err) {
    const _elapsedMs = Date.now() - startTime;
    console.error('[MarketToolsPrecomputeJob] Failed pre-computation pass:', err);
    throw err;
  }
}
