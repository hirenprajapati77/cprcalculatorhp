import { MarketBreadthService } from './market-breadth.service';
import { MultiYearBreakoutService } from './multi-year-breakout.service';
import { PatternBreakoutService } from './pattern-breakout.service';

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
  elapsedMs: number;
}> {
  const startTime = Date.now();
  console.log('[MarketToolsPrecomputeJob] Starting background pre-computation pass...');

  try {
    let breadthDate: string | undefined;
    let multiYearCount: number | undefined;
    let patternCount: number | undefined;

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

    const elapsedMs = Date.now() - startTime;
    console.log(`[MarketToolsPrecomputeJob] Pre-computation completed in ${elapsedMs}ms`);

    return {
      success: true,
      ...(breadthDate !== undefined && { breadthDate }),
      ...(multiYearCount !== undefined && { multiYearCount }),
      ...(patternCount !== undefined && { patternCount }),
      elapsedMs,
    };
  } catch (err) {
    const _elapsedMs = Date.now() - startTime;
    console.error('[MarketToolsPrecomputeJob] Failed pre-computation pass:', err);
    throw err;
  }
}
