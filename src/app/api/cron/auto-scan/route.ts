import { NextRequest, NextResponse } from 'next/server';
import { ScannerController } from '@/services/scanner-controller';
import { CacheService } from '@/services/cache.service';
import { notifyBreakoutsFromScan } from '@/services/alert/breakout-alert.pipeline';
import { isMarketOpen } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');

  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const universe = searchParams.get('universe') || 'NIFTY_FNO';

  // Only run when market is open (handles trading days, holidays, weekends, and exact hours)
  if (!isMarketOpen()) {
    return NextResponse.json({ message: 'Market closed' });
  }

  try {
    const results = await ScannerController.runFullScan(universe as "NIFTY50" | "NIFTY100" | "NIFTY200" | "NSE_FNO" | "NIFTY_FNO" | "ALL_NSE" | "ALL" | "Auto" | "WATCHLIST", 'NSE');

    console.log(`[AutoScan] Completed at ${new Date().toISOString()}, ${results.length} symbols scanned`);

    await CacheService.set('AUTO_SCAN_RESULT', {
      data: results,
      timestamp: new Date().toISOString()
    }, 5 * 60); // cache for 5 minutes — keeps UI fresh between cron cycles

    notifyBreakoutsFromScan(results, 'auto-scan');

    return NextResponse.json({ success: true, count: results.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
