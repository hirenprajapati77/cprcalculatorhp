import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { ScannerController } from '../../services/scanner-controller';
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
    });
    assert.deepEqual(upsertCalls.sort(), ['AAA', 'BBB']);
  } finally {
    prisma.scannerResult.upsert = originalScannerUpsert;
    prisma.marketSnapshot.upsert = originalSnapshotUpsert;
    prisma.scanHistory.create = originalHistoryCreate;
  }
});
