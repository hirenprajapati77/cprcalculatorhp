import { NextRequest, NextResponse } from 'next/server';
import {
  isBtstDiscoveryOpen,
  getISTTime,
  getISTDateString,
  BTST_CLOCK,
} from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { runBtstAlertJob } from '@/services/scheduler/btst-alert.job';
import { purgeInProcessCaches } from '@/services/in-process-cache';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
} from '@/services/scheduler/cron-run-claim';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const istTime = getISTTime();

  if (!istTime.isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  if (!isBtstDiscoveryOpen()) {
    const { hour, minute } = istTime;
    return NextResponse.json({
      message: `Time ${hour}:${String(minute).padStart(2, '0')} is outside alert window (${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST)`,
    });
  }

  const dateKey = getISTDateString();
  const btstBucket = Math.floor(istTime.totalMinutes / 5);
  const claimKey = `btst-alert:${dateKey}:${btstBucket}`;

  if (!(await tryClaimCronRun(claimKey))) {
    return NextResponse.json({
      skipped: true,
      reason: 'already run or in progress for this bucket',
      claimKey,
    });
  }

  try {
    const result = await runBtstAlertJob();
    await completeCronRun(claimKey, true);
    return NextResponse.json(result);
  } catch (error: unknown) {
    await releaseCronRun(claimKey);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    purgeInProcessCaches('btst-alert');
  }
}
