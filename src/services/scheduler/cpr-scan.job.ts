import { ScannerController } from '@/services/scanner-controller';

export type CprScanJobResult = {
  success: boolean;
  count: number;
  universe: string;
  market: string;
  message?: string;
};

/**
 * Periodically recomputes CPR scanner results during cash market hours.
 * Defaults to NIFTY_FNO universe on NSE market.
 */
export async function runCprScanJob(
  universe: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST' = 'NIFTY_FNO',
  market: 'NSE' | 'BSE' = 'NSE'
): Promise<CprScanJobResult> {
  try {
    const results = await ScannerController.runFullScan(universe, market);
    return {
      success: true,
      count: results.length,
      universe,
      market,
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
