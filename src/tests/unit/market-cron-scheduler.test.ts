import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
  resetCronRunClaims,
} from '../../services/scheduler/cron-run-claim';
import { resolveJournalSnapshotSlot } from '../../services/scheduler/journal-snapshot.job';
import { shouldCompleteClaimedJob } from '../../services/scheduler/market-cron.scheduler';

describe('cron-run-claim', () => {
  beforeEach(() => {
    resetCronRunClaims();
  });

  it('allows first claim and blocks duplicate until complete', () => {
    assert.equal(tryClaimCronRun('btst-journal:2026-07-22'), true);
    assert.equal(tryClaimCronRun('btst-journal:2026-07-22'), false);
    completeCronRun('btst-journal:2026-07-22');
    assert.equal(tryClaimCronRun('btst-journal:2026-07-22'), false);
  });

  it('release allows retry after failure', () => {
    assert.equal(tryClaimCronRun('cpr-journal:2026-07-22'), true);
    releaseCronRun('cpr-journal:2026-07-22');
    assert.equal(tryClaimCronRun('cpr-journal:2026-07-22'), true);
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
  it('releases retryable soft failures', () => {
    assert.equal(shouldCompleteClaimedJob({ success: false, message: 'No CPR signals' }), false);
    assert.equal(shouldCompleteClaimedJob({ sent: false, reason: 'no setups' }), false);
    assert.equal(shouldCompleteClaimedJob({ sent: false, reason: 'telegram_api_error' }), false);
  });

  it('completes successful or non-retryable results', () => {
    assert.equal(shouldCompleteClaimedJob({ success: true }), true);
    assert.equal(shouldCompleteClaimedJob({ sent: true }), true);
    assert.equal(shouldCompleteClaimedJob({ sent: false, reason: 'already sent today' }), true);
  });
});
