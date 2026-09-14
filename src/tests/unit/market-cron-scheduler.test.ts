import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
  resetCronRunClaims,
} from '../../services/scheduler/cron-run-claim';
import { resolveJournalSnapshotSlot } from '../../services/scheduler/journal-snapshot.job';
import {
  shouldCompleteClaimedJob,
  isEarningsPopulateWindowOpen,
  runEarningsPopulateJob,
  resetEarningsFailureAlertDate,
  getLastEarningsFailureAlertDate,
} from '../../services/scheduler/market-cron.scheduler';
import { EarningsPopulatorService } from '../../services/earnings-populator.service';

describe('cron-run-claim', () => {
  beforeEach(() => {
    resetCronRunClaims();
  });

  it('allows first claim and blocks duplicate until complete', async () => {
    assert.equal(await tryClaimCronRun('btst-journal:2026-07-22'), true);
    assert.equal(await tryClaimCronRun('btst-journal:2026-07-22'), false);
    await completeCronRun('btst-journal:2026-07-22');
    assert.equal(await tryClaimCronRun('btst-journal:2026-07-22'), false);
  });

  it('release allows retry after failure', async () => {
    assert.equal(await tryClaimCronRun('cpr-journal:2026-07-22'), true);
    await releaseCronRun('cpr-journal:2026-07-22');
    assert.equal(await tryClaimCronRun('cpr-journal:2026-07-22'), true);
  });
});

describe('resolveJournalSnapshotSlot', () => {
  it('maps IST windows to snapshot slots on a trading day', () => {
    const slot916 = resolveJournalSnapshotSlot(new Date('2026-07-22T03:47:00.000Z')); // 09:17 IST
    assert.equal(slot916, '916');
    const slot930 = resolveJournalSnapshotSlot(new Date('2026-07-22T04:02:00.000Z')); // 09:32 IST
    assert.equal(slot930, '930');
    const outside = resolveJournalSnapshotSlot(new Date('2026-07-22T05:00:00.000Z')); // 10:30 IST
    assert.equal(outside, null);
  });
});

describe('shouldCompleteClaimedJob', () => {
  it('releases only true retryable soft failures', () => {
    assert.equal(shouldCompleteClaimedJob({ success: false, message: 'DB timeout' }), false);
    assert.equal(shouldCompleteClaimedJob({ sent: false, reason: 'telegram_api_error' }), false);
  });

  it('retains claim for terminal empty outcomes (no overnight re-run storm)', () => {
    assert.equal(
      shouldCompleteClaimedJob({ success: false, message: 'No CPR signals with score >= 75 today' }),
      true
    );
    assert.equal(shouldCompleteClaimedJob({ sent: false, reason: 'no setups', count: 0 }), true);
    assert.equal(
      shouldCompleteClaimedJob({
        success: false,
        overnightEnsured: true,
        logged: [],
      }),
      true
    );
  });

  it('completes successful or non-retryable results', () => {
    assert.equal(shouldCompleteClaimedJob({ success: true }), true);
    assert.equal(shouldCompleteClaimedJob({ sent: true }), true);
    assert.equal(shouldCompleteClaimedJob({ sent: false, reason: 'already sent today' }), true);
  });
});

describe('isEarningsPopulateWindowOpen', () => {
  it('opens strictly during 14:15 - 14:25 IST on trading days', () => {
    // 2026-07-22 is Wednesday (trading day)
    // 14:14 IST = 08:44 UTC -> false
    assert.equal(isEarningsPopulateWindowOpen(new Date('2026-07-22T08:44:00.000Z')), false);
    // 14:15 IST = 08:45 UTC -> true
    assert.equal(isEarningsPopulateWindowOpen(new Date('2026-07-22T08:45:00.000Z')), true);
    // 14:20 IST = 08:50 UTC -> true
    assert.equal(isEarningsPopulateWindowOpen(new Date('2026-07-22T08:50:00.000Z')), true);
    // 14:25 IST = 08:55 UTC -> true
    assert.equal(isEarningsPopulateWindowOpen(new Date('2026-07-22T08:55:00.000Z')), true);
    // 14:26 IST = 08:56 UTC -> false
    assert.equal(isEarningsPopulateWindowOpen(new Date('2026-07-22T08:56:00.000Z')), false);

    // Weekend check: 2026-07-26 is Sunday
    assert.equal(isEarningsPopulateWindowOpen(new Date('2026-07-26T08:50:00.000Z')), false);
  });
});

describe('earnings populator failure alert deduplication', () => {
  beforeEach(() => {
    resetCronRunClaims();
    resetEarningsFailureAlertDate();
  });

  it('sends alert on first failure and suppresses subsequent failures on the same date key', async () => {
    const origPopulate = EarningsPopulatorService.populate;
    const calls: { dryRun?: boolean; yahooTimeoutMs?: number; sendAlert?: boolean }[] = [];

    EarningsPopulatorService.populate = async (dryRun = false, yahooTimeoutMs = 10_000, sendAlert = true) => {
      calls.push({ dryRun, yahooTimeoutMs, sendAlert });
      return { success: false, nseCount: 0, yahooCount: 0, errors: ['NSE down'] };
    };

    try {
      const dateKey = '2026-07-22';

      // Tick 1 (14:15): first failure -> should send alert
      await runEarningsPopulateJob(dateKey);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].sendAlert, true, 'First attempt must send alert');
      assert.equal(getLastEarningsFailureAlertDate(), dateKey);

      // Tick 2 (14:16): retry after failure (claim was released because success is false)
      await runEarningsPopulateJob(dateKey);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].sendAlert, false, 'Retry in same day window must suppress alert');

      // Tick 3 (14:17): retry again -> still suppressed
      await runEarningsPopulateJob(dateKey);
      assert.equal(calls.length, 3);
      assert.equal(calls[2].sendAlert, false, 'Second retry in same day window must suppress alert');

      // Next trading day (2026-07-23): new date key -> alert should send again on first failure
      const nextDateKey = '2026-07-23';
      await runEarningsPopulateJob(nextDateKey);
      assert.equal(calls.length, 4);
      assert.equal(calls[3].sendAlert, true, 'First failure on next trading day must send alert');
      assert.equal(getLastEarningsFailureAlertDate(), nextDateKey);

      // Next trading day tick 2 -> retry suppressed
      await runEarningsPopulateJob(nextDateKey);
      assert.equal(calls.length, 5);
      assert.equal(calls[4].sendAlert, false, 'Retry on next trading day must suppress alert');
    } finally {
      EarningsPopulatorService.populate = origPopulate;
      resetEarningsFailureAlertDate();
    }
  });

  it('resets alert tracking when stopMarketCronScheduler is called', async () => {
    const { stopMarketCronScheduler } = await import('../../services/scheduler/market-cron.scheduler');
    const origPopulate = EarningsPopulatorService.populate;

    EarningsPopulatorService.populate = async () => {
      return { success: false, nseCount: 0, yahooCount: 0, errors: ['NSE down'] };
    };

    try {
      const dateKey = '2026-07-22';
      await runEarningsPopulateJob(dateKey);
      assert.equal(getLastEarningsFailureAlertDate(), dateKey);

      stopMarketCronScheduler();
      assert.equal(getLastEarningsFailureAlertDate(), null, 'stopMarketCronScheduler should reset alert tracking');
    } finally {
      EarningsPopulatorService.populate = origPopulate;
    }
  });
});

