import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lastRefreshLabel } from '@/utils/format';
import { runCprScanJob } from '@/services/scheduler/cpr-scan.job';
import { ScannerController } from '@/services/scanner-controller';
import {
  tryClaimCronRun,
  completeCronRun,
  resetCronRunClaims,
} from '@/services/scheduler/cron-run-claim';

describe('lastRefreshLabel (honest Last Refresh)', () => {
  it('formats ISO timestamps without inventing now', () => {
    const label = lastRefreshLabel('2026-07-27T09:45:10.000Z');
    assert.match(label, /^\d{2}:\d{2}:\d{2}$/);
  });

  it('extracts time from BTST/INDEX human scannedAt labels', () => {
    assert.equal(lastRefreshLabel('15:12 IST, 27 Jul'), '15:12');
    assert.equal(lastRefreshLabel('09:30:15 IST, 27 Jul'), '09:30:15');
  });

  it('returns empty string when scannedAt is missing (UI shows —)', () => {
    assert.equal(lastRefreshLabel(undefined), '');
    assert.equal(lastRefreshLabel(null), '');
    assert.equal(lastRefreshLabel(''), '');
  });
});

describe('runCprScanJob', () => {
  it('returns success/count from ScannerController.runFullScan', async () => {
    const original = ScannerController.runFullScan;
    ScannerController.runFullScan = (async () =>
      [{ symbol: 'A' }, { symbol: 'B' }] as never) as typeof ScannerController.runFullScan;
    try {
      const result = await runCprScanJob('NIFTY_FNO', 'NSE');
      assert.equal(result.success, true);
      assert.equal(result.count, 2);
      assert.equal(result.universe, 'NIFTY_FNO');
      assert.equal(result.market, 'NSE');
    } finally {
      ScannerController.runFullScan = original;
    }
  });

  it('returns success=false when runFullScan throws', async () => {
    const original = ScannerController.runFullScan;
    ScannerController.runFullScan = (async () => {
      throw new Error('boom');
    }) as typeof ScannerController.runFullScan;
    try {
      const result = await runCprScanJob('NIFTY_FNO', 'NSE');
      assert.equal(result.success, false);
      assert.equal(result.count, 0);
      assert.equal(result.message, 'boom');
    } finally {
      ScannerController.runFullScan = original;
    }
  });
});

describe('cpr-scan claim buckets (retainClaim)', () => {
  it('same bucket key cannot re-claim after retainClaim=true', () => {
    resetCronRunClaims();
    const key = 'cpr-scan:2026-07-27:150';
    assert.equal(tryClaimCronRun(key), true);
    completeCronRun(key, true);
    assert.equal(tryClaimCronRun(key), false);
  });

  it('next time-bucket key can claim again (periodic re-fire)', () => {
    resetCronRunClaims();
    const keyA = 'cpr-scan:2026-07-27:150';
    const keyB = 'cpr-scan:2026-07-27:151';
    assert.equal(tryClaimCronRun(keyA), true);
    completeCronRun(keyA, true);
    assert.equal(tryClaimCronRun(keyB), true);
    completeCronRun(keyB, true);
  });

  it('retainClaim=false allows same key to reclaim after complete', () => {
    resetCronRunClaims();
    const key = 'cpr-scan:ephemeral';
    assert.equal(tryClaimCronRun(key), true);
    completeCronRun(key, false);
    assert.equal(tryClaimCronRun(key), true);
  });
});
