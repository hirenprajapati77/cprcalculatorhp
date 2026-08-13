import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { purgeInProcessCaches } from '@/services/in-process-cache';
import { getISTDateString, getISTTime, isMarketOpen } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { runCprScanJob } from '@/services/scheduler/cpr-scan.job';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
} from '@/services/scheduler/cron-run-claim';

/**
 * Host-crontab entry for CPR auto-scan. Shares the same time-bucket claim key as
 * MarketCronScheduler (`cpr-scan:{universe}:{date}:{bucket}`) so crontab + in-process ticks
 * cannot double-scan the F&O universe on the 1 GB Oracle box.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');

  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const universe = (searchParams.get('universe') || 'NIFTY_FNO') as
    | 'NIFTY50'
    | 'NIFTY100'
    | 'NIFTY200'
    | 'NSE_FNO'
    | 'NIFTY_FNO'
    | 'ALL_NSE'
    | 'ALL'
    | 'Auto'
    | 'WATCHLIST';

  if (!isMarketOpen()) {
    return NextResponse.json({ message: 'Market closed' });
  }

  const istTime = getISTTime();
  const dateKey = getISTDateString();
  const intervalMinutes = Math.max(1, env.CPR_SCAN_INTERVAL_MINUTES || 5);
  const timeBucket = Math.floor(istTime.totalMinutes / intervalMinutes);
  const claimKey = `cpr-scan:${universe}:${dateKey}:${timeBucket}`;

  if (!(await tryClaimCronRun(claimKey))) {
    return NextResponse.json({
      skipped: true,
      reason: 'already run or in progress for this bucket',
      claimKey,
    });
  }

  try {
    const result = await runCprScanJob(universe, 'NSE', 'auto-scan');

    if (result.success) {
      await completeCronRun(claimKey, true);
      console.log(
        `[AutoScan] Completed at ${new Date().toISOString()}, ${result.count} symbols scanned`
      );
      return NextResponse.json({ success: true, count: result.count, claimKey });
    }

    await releaseCronRun(claimKey);
    return NextResponse.json(
      { error: result.message || 'Scan failed', claimKey },
      { status: 500 }
    );
  } catch (error: unknown) {
    await releaseCronRun(claimKey);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    purgeInProcessCaches('auto-scan');
  }
}
