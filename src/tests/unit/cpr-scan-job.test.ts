import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lastRefreshLabel } from '@/utils/format';
import { runCprScanJob } from '@/services/scheduler/cpr-scan.job';
import { ScannerController } from '@/services/scanner-controller';
import { BreakoutWatcherService } from '@/services/alert/breakout-watcher.service';
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
  it('returns success/count from ScannerController.runFullScan and notifies breakouts', async () => {
    const originalScan = ScannerController.runFullScan;
    const originalDetect = BreakoutWatcherService.detectNewBreakouts;
    const { CacheService } = await import('@/services/cache.service');
    const originalSet = CacheService.set;
    const cacheKeys: string[] = [];
    let detectCalls = 0;
    ScannerController.runFullScan = (async () =>
      [{ symbol: 'A', ltp: 1, signals: [] }, { symbol: 'B', ltp: 2, signals: [] }] as never) as typeof ScannerController.runFullScan;
    BreakoutWatcherService.detectNewBreakouts = (async () => {
      detectCalls += 1;
      return [];
    }) as typeof BreakoutWatcherService.detectNewBreakouts;
    CacheService.set = (async (key: string, value: NonNullable<unknown>, ttlSeconds: number) => {
      cacheKeys.push(key);
      return originalSet.call(CacheService, key, value, ttlSeconds);
    }) as typeof CacheService.set;
    try {
      const result = await runCprScanJob('NIFTY_FNO', 'NSE');
      assert.equal(result.success, true);
      assert.equal(result.count, 2);
      assert.equal(result.universe, 'NIFTY_FNO');
      assert.equal(result.market, 'NSE');
      assert.ok(cacheKeys.includes('AUTO_SCAN_RESULT:NIFTY_FNO:NSE'));
      // Fire-and-forget: allow microtask queue to run detect
      await Promise.resolve();
      assert.equal(detectCalls, 1);
    } finally {
      ScannerController.runFullScan = originalScan;
      BreakoutWatcherService.detectNewBreakouts = originalDetect;
      CacheService.set = originalSet;
    }
  });

  it('scopes cache key by universe so ALL_NSE does not overwrite NIFTY_FNO', async () => {
    const originalScan = ScannerController.runFullScan;
    const originalDetect = BreakoutWatcherService.detectNewBreakouts;
    const { CacheService } = await import('@/services/cache.service');
    const originalSet = CacheService.set;
    const cacheKeys: string[] = [];
    ScannerController.runFullScan = (async () =>
      [{ symbol: 'X', ltp: 1, signals: [] }] as never) as typeof ScannerController.runFullScan;
    BreakoutWatcherService.detectNewBreakouts = (async () => []) as typeof BreakoutWatcherService.detectNewBreakouts;
    CacheService.set = (async (key: string) => {
      cacheKeys.push(key);
    }) as typeof CacheService.set;
    try {
      await runCprScanJob('ALL_NSE', 'NSE');
      assert.deepEqual(cacheKeys, ['AUTO_SCAN_RESULT:ALL_NSE:NSE']);
    } finally {
      ScannerController.runFullScan = originalScan;
      BreakoutWatcherService.detectNewBreakouts = originalDetect;
      CacheService.set = originalSet;
    }
  });

  it('returns success=false when runFullScan throws and skips notify', async () => {
    const originalScan = ScannerController.runFullScan;
    const originalDetect = BreakoutWatcherService.detectNewBreakouts;
    let detectCalls = 0;
    ScannerController.runFullScan = (async () => {
      throw new Error('boom');
    }) as typeof ScannerController.runFullScan;
    BreakoutWatcherService.detectNewBreakouts = (async () => {
      detectCalls += 1;
      return [];
    }) as typeof BreakoutWatcherService.detectNewBreakouts;
    try {
      const result = await runCprScanJob('NIFTY_FNO', 'NSE');
      assert.equal(result.success, false);
      assert.equal(result.count, 0);
      assert.equal(result.message, 'boom');
      await Promise.resolve();
      assert.equal(detectCalls, 0);
    } finally {
      ScannerController.runFullScan = originalScan;
      BreakoutWatcherService.detectNewBreakouts = originalDetect;
    }
  });
});

describe('cpr-scan claim buckets (retainClaim)', () => {
  it('same bucket key cannot re-claim after retainClaim=true', async () => {
    resetCronRunClaims();
    const key = 'cpr-scan:2026-07-27:150';
    assert.equal(await tryClaimCronRun(key), true);
    await completeCronRun(key, true);
    assert.equal(await tryClaimCronRun(key), false);
  });

  it('next time-bucket key can claim again (periodic re-fire)', async () => {
    resetCronRunClaims();
    const keyA = 'cpr-scan:2026-07-27:150';
    const keyB = 'cpr-scan:2026-07-27:151';
    assert.equal(await tryClaimCronRun(keyA), true);
    await completeCronRun(keyA, true);
    assert.equal(await tryClaimCronRun(keyB), true);
    await completeCronRun(keyB, true);
  });

  it('retainClaim=false allows same key to reclaim after complete', async () => {
    resetCronRunClaims();
    const key = 'cpr-scan:ephemeral';
    assert.equal(await tryClaimCronRun(key), true);
    await completeCronRun(key, false);
    assert.equal(await tryClaimCronRun(key), true);
  });
});
