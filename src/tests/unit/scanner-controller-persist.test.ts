import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { ScannerController } from '../../services/scanner-controller';
import { CacheService } from '../../services/cache.service';
import type { ScannerSignalResult } from '../../services/scanner.service';

type RankedRow = ScannerSignalResult & { score: number };

function makeRow(symbol: string): RankedRow {
  return {
    symbol,
    market: 'NSE',
    ltp: 100,
    open: 99,
    high: 101,
    low: 98,
    close: 100,
    volume: 1_000_000,
    avgVolume: 900_000,
    previousClose: 99,
    marketCap: 5000,
    sector: 'Test',
    pivot: 100,
    bc: 99,
    tc: 101,
    r1: 102,
    r2: 103,
    r3: 104,
    r4: 105,
    s1: 98,
    s2: 97,
    s3: 96,
    s4: 95,
    width: 0.5,
    classification: 'NORMAL',
    signals: ['BULLISH'],
    score: 50,
    entry: 101,
    sl: 99,
    target: 102,
    rr: '1:1.5',
    confidence: 70,
  };
}

test('persistScanResults upserts scanner rows and scan history', async () => {
  const upsertCalls: string[] = [];
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;

  prisma.scannerResult.upsert = (async (args: { where: { symbol_date: { symbol: string } } }) => {
    upsertCalls.push(args.where.symbol_date.symbol);
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async (args: { data: { resultCount: number; durationMs: number } }) => {
    assert.equal(args.data.resultCount, 2);
    assert.equal(args.data.durationMs, 1234);
    return {} as never;
  }) as unknown as typeof prisma.scanHistory.create;

  try {
    await ScannerController.persistScanResults({
      filtered: [makeRow('AAA'), makeRow('BBB')],
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-08-11',
      scanDurationMs: 1234,
      retryDelayMs: 0,
    });
    assert.deepEqual(upsertCalls.sort(), ['AAA', 'BBB']);
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
  }
});

test('persistScanResults fails once, retry succeeds — no failure marker written', async () => {
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;
  const originalCacheSet = CacheService.set;

  let attemptCount = 0;
  const writtenKeys: string[] = [];

  prisma.scannerResult.upsert = (async () => {
    attemptCount++;
    if (attemptCount === 1) {
      throw new Error('Transient DB Connection Timeout');
    }
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  CacheService.set = (async (key: string, val: NonNullable<unknown>, ttl?: number) => {
    if (key.startsWith('scan_persist_failed:')) {
      writtenKeys.push(key);
    }
    return originalCacheSet.call(CacheService, key, val, ttl ?? 3600);
  }) as unknown as typeof CacheService.set;

  try {
    await ScannerController.persistScanResults({
      filtered: [makeRow('CCC')],
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-08-14',
      scanDurationMs: 500,
      retryDelayMs: 1,
    });

    assert.equal(attemptCount, 2, 'Should attempt initial try + 1 retry');
    assert.equal(writtenKeys.length, 0, 'No failure marker should be written when retry succeeds');
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    CacheService.set = originalCacheSet;
  }
});

test('persistScanResults both attempts fail — failure marker written with correct key/data, executeScan return value unaffected', async () => {
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;
  const originalCacheSet = CacheService.set;

  let attemptCount = 0;
  const failurePayloads: Array<{ key: string; val: Record<string, unknown> }> = [];

  prisma.scannerResult.upsert = (async () => {
    attemptCount++;
    throw new Error('Persistent DB Failure (Connection Pool Exhausted)');
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  CacheService.set = (async (key: string, val: NonNullable<unknown>, ttl?: number) => {
    if (key.startsWith('scan_persist_failed:')) {
      failurePayloads.push({ key, val: val as Record<string, unknown> });
    }
    return originalCacheSet.call(CacheService, key, val, ttl ?? 3600);
  }) as unknown as typeof CacheService.set;

  try {
    const rows = [makeRow('DDD'), makeRow('EEE')];

    // Verify caller-facing behavior is completely unaffected (function resolves cleanly without throwing)
    await assert.doesNotReject(async () => {
      await ScannerController.persistScanResults({
        filtered: rows,
        universeName: 'NIFTY_FNO',
        market: 'NSE',
        today: '2026-08-14',
        scanDurationMs: 800,
        retryDelayMs: 1,
      });
    });

    assert.equal(attemptCount, 4, 'Should attempt upserts across 2 items for 2 attempts (2 x 2 = 4 calls)');
    assert.equal(failurePayloads.length, 1, 'Exactly one failure marker should be written');
    
    const marker = failurePayloads[0];
    assert.match(marker.key, /^scan_persist_failed:NIFTY_FNO:2026-08-14:\d+$/);
    assert.equal(marker.val.universeName, 'NIFTY_FNO');
    assert.equal(marker.val.market, 'NSE');
    assert.equal(marker.val.date, '2026-08-14');
    assert.equal(marker.val.filteredCount, 2);
    assert.equal(marker.val.error, 'Persistent DB Failure (Connection Pool Exhausted)');
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    CacheService.set = originalCacheSet;
  }
});

