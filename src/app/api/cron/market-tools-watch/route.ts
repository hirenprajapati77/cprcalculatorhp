import { NextResponse } from 'next/server';
import { isValidCronSecret } from '@/lib/crypto';
import { MarketToolsWatchService } from '@/services/alert/market-tools-watch.service';
import { getISTDateString, isNseTradingDay } from '@/lib/market-hours';
import { tryClaimCronRun, completeCronRun, releaseCronRun } from '@/services/scheduler/cron-run-claim';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-cron-secret');
    if (!isValidCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';
    const force = url.searchParams.get('force') === 'true';
    const now = new Date();
    const dateString = getISTDateString(now);

    // In production mode (!dryRun), trading day validation is mandatory and cannot be bypassed
    // to prevent accidental notification dispatches on weekends or holidays.
    // In dryRun mode, force=true allows previewing notifications on non-trading days for testing/inspection.
    if (!dryRun && !isNseTradingDay(now)) {
      return NextResponse.json({ skipped: true, reason: 'not_a_trading_day', date: dateString });
    } else if (dryRun && !force && !isNseTradingDay(now)) {
      return NextResponse.json({ skipped: true, reason: 'not_a_trading_day', date: dateString });
    }

    // Dry-run mode skips the cron run claim and never calls Telegram.
    if (dryRun) {
      const result = await MarketToolsWatchService.dispatchWatchAlerts({ dryRun: true });
      return NextResponse.json(result);
    }

    // Dedicated daily cron claim isolated from all CPR / breakout alert claims
    const claimKey = `market-tools-watch:${dateString}`;

    // In production delivery mode, claim locking is strictly enforced.
    // An existing completed run cannot be re-executed to prevent duplicate production messages.
    if (!(await tryClaimCronRun(claimKey))) {
      return NextResponse.json({ skipped: true, reason: 'already run or in progress', claimKey });
    }

    try {
      const result = await MarketToolsWatchService.dispatchWatchAlerts();

      if (!result.success) {
        // If precompute is not ready, release claim so scheduler can retry later
        await releaseCronRun(claimKey);
        if (result.reason?.includes('precompute_not_ready')) {
          return NextResponse.json({
            skipped: true,
            reason: result.reason,
            details: result,
          }, { status: 200 });
        }

        return NextResponse.json({
          error: 'Market Tools WATCH dispatch failed',
          details: result,
        }, { status: 500 });
      }

      await completeCronRun(claimKey, true);
      return NextResponse.json(result);
    } catch (innerError) {
      await releaseCronRun(claimKey);
      throw innerError;
    }
  } catch (error: unknown) {
    console.error('[MarketToolsWatchRoute] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }, { status: 500 });
  }
}
