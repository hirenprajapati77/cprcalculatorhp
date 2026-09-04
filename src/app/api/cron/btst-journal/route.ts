import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import {
  getISTTime,
  getISTDateString,
  isBtstJournalWindowOpen,
  BTST_CLOCK,
} from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { runBtstJournalJob } from '@/services/scheduler/btst-journal.job';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
} from '@/services/scheduler/cron-run-claim';

/**
 * Premium / tradable BTST–STBT Trade Journal cron.
 * Core logic lives in runBtstJournalJob() — also invoked by MarketCronScheduler.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');

  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const bypassWindow =
    env.NODE_ENV !== 'production' && searchParams.get('bypassWindow') === 'true';

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay && !bypassWindow) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  if (!isBtstJournalWindowOpen() && !bypassWindow) {
    return NextResponse.json({
      message: `BTST journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')} (expected ${BTST_CLOCK.journalStart}–${BTST_CLOCK.journalEnd})`,
    });
  }

  const dateKey = getISTDateString();
  const claimKey = `btst-journal:${dateKey}`;

  if (!(await tryClaimCronRun(claimKey))) {
    return NextResponse.json({
      skipped: true,
      reason: 'already run or in progress',
      claimKey,
    });
  }

  try {
    const result = await runBtstJournalJob();
    await completeCronRun(claimKey, true);
    return NextResponse.json(result);
  } catch (err) {
    await releaseCronRun(claimKey);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
