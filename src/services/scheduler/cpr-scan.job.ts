import { ScannerController } from '@/services/scanner-controller';
import * as breakoutPipeline from '@/services/alert/breakout-alert.pipeline';
import { CacheService } from '@/services/cache.service';
import type { ScannerSignalResult } from '@/services/scanner.service';

export type CprScanJobResult = {
  success: boolean;
  count: number;
  universe: string;
  market: string;
  message?: string;
  results?: Array<ScannerSignalResult & { score: number }>;
};

/**
 * Periodically recomputes CPR scanner results during cash market hours.
 * Defaults to NIFTY_FNO universe on NSE market.
 * Breakout Telegram alerts fire from this cron path only (not UI refresh).
 * Shared by MarketCronScheduler and `/api/cron/auto-scan` (same claim key).
 */
export async function runCprScanJob(
  universe: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST' = 'NIFTY_FNO',
  market: 'NSE' | 'BSE' = 'NSE',
  alertLabel = 'cpr-scan'
): Promise<CprScanJobResult> {
  try {
    const results = await ScannerController.runFullScan(universe, market);
    await CacheService.set(
      'AUTO_SCAN_RESULT',
      { data: results, timestamp: new Date().toISOString() },
      5 * 60
    );
    breakoutPipeline.notifyBreakoutsFromScan(results, alertLabel);
    return {
      success: true,
      count: results.length,
      universe,
      market,
      results,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CprScanJob] Failed for universe=${universe}, market=${market}:`, err);
    return {
      success: false,
      count: 0,
      universe,
      market,
      message,
    };
  }
}
