import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import {
  ScannerController,
  _resetScanGenerationsForTesting,
  _getLatestScanGeneration,
  _setScanGenerationForTesting,
} from '../../services/scanner-controller';
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

test('generation-safe persistence: G1 completes normally when no newer generation exists', async () => {
  _resetScanGenerationsForTesting();
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;

  const persistedSymbols: string[] = [];
  prisma.scannerResult.upsert = (async (args: { where: { symbol_date: { symbol: string } } }) => {
    persistedSymbols.push(args.where.symbol_date.symbol);
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  try {
    const t0 = 100_000;
    _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
      scanId: 'scan_g1',
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(t0).toISOString(),
      scanStartedAtMs: t0,
      status: 'calculating',
    });

    await ScannerController.persistScanResults({
      filtered: [makeRow('SYM1'), makeRow('SYM2')],
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-09-25',
      scanDurationMs: 1500,
      scanId: 'scan_g1',
      scanStartedAtMs: t0,
      retryDelayMs: 0,
    });

    assert.deepEqual(persistedSymbols.sort(), ['SYM1', 'SYM2']);
    const meta = _getLatestScanGeneration('NIFTY_FNO:NSE:2026-09-25');
    assert.equal(meta?.status, 'completed');
    assert.equal(meta?.persistedChunks, 1);
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    _resetScanGenerationsForTesting();
  }
});

test('generation-safe persistence: G2 starts before G1 persistence begins → G1 writes nothing', async () => {
  _resetScanGenerationsForTesting();
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;

  let upsertCalled = false;
  prisma.scannerResult.upsert = (async () => {
    upsertCalled = true;
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  try {
    const tG1 = 100_000;
    const tG2 = 200_000; // Newer scan

    // G1 was recorded
    _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
      scanId: 'scan_g1',
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(tG1).toISOString(),
      scanStartedAtMs: tG1,
      status: 'calculating',
    });

    // Before G1 persist starts, G2 completes and becomes the latest generation
    _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
      scanId: 'scan_g2',
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(tG2).toISOString(),
      scanStartedAtMs: tG2,
      status: 'calculating',
    });

    // G1 persist now executes
    await ScannerController.persistScanResults({
      filtered: [makeRow('OLD1'), makeRow('OLD2')],
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-09-25',
      scanDurationMs: 1500,
      scanId: 'scan_g1',
      scanStartedAtMs: tG1,
      retryDelayMs: 0,
    });

    // G1 should have written NOTHING
    assert.equal(upsertCalled, false, 'G1 should not execute any upserts because it is superseded before start');
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    _resetScanGenerationsForTesting();
  }
});

test('generation-safe persistence: G2 starts halfway through G1 persistence → remaining G1 chunks are skipped', async () => {
  _resetScanGenerationsForTesting();
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;

  const persistedSymbols: string[] = [];
  const tG1 = 100_000;
  const tG2 = 200_000;

  // 20 items: chunk 1 has 15 items, chunk 2 has 5 items (CHUNK_SIZE = 15)
  const rows = Array.from({ length: 20 }, (_, i) => makeRow(`STOCK_${i + 1}`));

  prisma.scannerResult.upsert = (async (args: { where: { symbol_date: { symbol: string } } }) => {
    const sym = args.where.symbol_date.symbol;
    persistedSymbols.push(sym);

    // When the 15th item of chunk 1 is written, G2 suddenly finishes calculation and becomes latest
    if (sym === 'STOCK_15') {
      _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
        scanId: 'scan_g2',
        universeName: 'NIFTY_FNO',
        market: 'NSE',
        date: '2026-09-25',
        scanStartedAt: new Date(tG2).toISOString(),
        scanStartedAtMs: tG2,
        status: 'calculating',
      });
    }
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  try {
    _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
      scanId: 'scan_g1',
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(tG1).toISOString(),
      scanStartedAtMs: tG1,
      status: 'calculating',
    });

    await ScannerController.persistScanResults({
      filtered: rows,
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-09-25',
      scanDurationMs: 3000,
      scanId: 'scan_g1',
      scanStartedAtMs: tG1,
      retryDelayMs: 0,
    });

    // Chunk 1 had 15 items. Chunk 2 (STOCK_16 to STOCK_20) should have been skipped!
    assert.equal(persistedSymbols.length, 15, 'Only Chunk 1 (15 items) should be persisted before superseding');
    assert.equal(persistedSymbols.includes('STOCK_15'), true);
    assert.equal(persistedSymbols.includes('STOCK_16'), false, 'Chunk 2 items must not be persisted');
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    _resetScanGenerationsForTesting();
  }
});

test('generation-safe persistence: full overlap simulation (G1 halted, G2 persists, final DB has G2 data)', async () => {
  _resetScanGenerationsForTesting();
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;

  // In-memory representation of DB
  const dbState = new Map<string, { ltp: number; scanId: string }>();

  const tG1 = 100_000;
  const tG2 = 200_000;

  const g1Rows = Array.from({ length: 20 }, (_, i) => ({
    ...makeRow(`SYM_${i + 1}`),
    ltp: 100.0, // G1 older price
  }));

  const g2Rows = Array.from({ length: 20 }, (_, i) => ({
    ...makeRow(`SYM_${i + 1}`),
    ltp: 105.0, // G2 newer price
  }));

  prisma.scannerResult.upsert = (async (args: {
    where: { symbol_date: { symbol: string } };
    update: { ltp: number };
  }) => {
    const sym = args.where.symbol_date.symbol;
    // Inspect current active scanId
    const activeMeta = _getLatestScanGeneration('NIFTY_FNO:NSE:2026-09-25');
    dbState.set(sym, { ltp: args.update.ltp, scanId: activeMeta?.scanId || 'unknown' });

    // Simulate G2 triggering right after G1 finishes writing chunk 1
    if (sym === 'SYM_15' && activeMeta?.scanId === 'scan_g1') {
      _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
        scanId: 'scan_g2',
        universeName: 'NIFTY_FNO',
        market: 'NSE',
        date: '2026-09-25',
        scanStartedAt: new Date(tG2).toISOString(),
        scanStartedAtMs: tG2,
        status: 'calculating',
      });
    }
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  try {
    // 1. G1 starts
    _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
      scanId: 'scan_g1',
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(tG1).toISOString(),
      scanStartedAtMs: tG1,
      status: 'calculating',
    });

    // 2. G1 runs persist
    await ScannerController.persistScanResults({
      filtered: g1Rows,
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-09-25',
      scanDurationMs: 4000,
      scanId: 'scan_g1',
      scanStartedAtMs: tG1,
      retryDelayMs: 0,
    });

    // At this point, G1 only wrote SYM_1..SYM_15 at ltp=100. SYM_16..SYM_20 were not written.
    assert.equal(dbState.size, 15);
    assert.equal(dbState.get('SYM_1')?.ltp, 100.0);
    assert.equal(dbState.get('SYM_16'), undefined);

    // 3. G2 runs persist
    await ScannerController.persistScanResults({
      filtered: g2Rows,
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-09-25',
      scanDurationMs: 1000,
      scanId: 'scan_g2',
      scanStartedAtMs: tG2,
      retryDelayMs: 0,
    });

    // G2 completes all 20 rows at ltp=105.0
    assert.equal(dbState.size, 20);
    for (let i = 1; i <= 20; i++) {
      assert.equal(dbState.get(`SYM_${i}`)?.ltp, 105.0, `SYM_${i} must have G2 price (105.0)`);
    }
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    _resetScanGenerationsForTesting();
  }
});

test('generation-safe persistence: different universe/market/date generations do not interfere', async () => {
  _resetScanGenerationsForTesting();
  const originalScannerUpsert = prisma.scannerResult.upsert;
  const originalSnapshotUpsert = prisma.marketSnapshot.upsert;
  const originalHistoryCreate = prisma.scanHistory.create;

  const persistedSymbols: string[] = [];
  prisma.scannerResult.upsert = (async (args: { where: { symbol_date: { symbol: string } } }) => {
    persistedSymbols.push(args.where.symbol_date.symbol);
    return {} as never;
  }) as unknown as typeof prisma.scannerResult.upsert;
  prisma.marketSnapshot.upsert = (async () => ({} as never)) as unknown as typeof prisma.marketSnapshot.upsert;
  prisma.scanHistory.create = (async () => ({} as never)) as unknown as typeof prisma.scanHistory.create;

  try {
    const t1 = 100_000;
    const t2 = 200_000;

    // Generation for NIFTY_FNO
    _setScanGenerationForTesting('NIFTY_FNO:NSE:2026-09-25', {
      scanId: 'scan_fno',
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(t1).toISOString(),
      scanStartedAtMs: t1,
      status: 'calculating',
    });

    // Generation for WATCHLIST with a newer timestamp
    _setScanGenerationForTesting('WATCHLIST:NSE:2026-09-25', {
      scanId: 'scan_watchlist',
      universeName: 'WATCHLIST',
      market: 'NSE',
      date: '2026-09-25',
      scanStartedAt: new Date(t2).toISOString(),
      scanStartedAtMs: t2,
      status: 'calculating',
    });

    // Persisting NIFTY_FNO should NOT be blocked by WATCHLIST's newer timestamp
    await ScannerController.persistScanResults({
      filtered: [makeRow('FNO_SYM')],
      universeName: 'NIFTY_FNO',
      market: 'NSE',
      today: '2026-09-25',
      scanDurationMs: 1200,
      scanId: 'scan_fno',
      scanStartedAtMs: t1,
      retryDelayMs: 0,
    });

    assert.deepEqual(persistedSymbols, ['FNO_SYM']);
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
    _resetScanGenerationsForTesting();
  }
});


