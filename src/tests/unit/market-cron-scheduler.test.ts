import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
  resetCronRunClaims,
} from '../../services/scheduler/cron-run-claim';
import { resolveJournalSnapshotSlot } from '../../services/scheduler/journal-snapshot.job';

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
