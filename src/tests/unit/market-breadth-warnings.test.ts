import test from 'node:test';
import assert from 'node:assert/strict';
import { MarketBreadthService, FNO_SYMBOLS } from '../../services/market-tools/market-breadth.service';

test('Market Breadth universe coverage and threshold warnings (Fix 3b & 3c)', async (t) => {
  const globalForPrisma = globalThis as any;
  const originalPrisma = globalForPrisma.prisma;

  t.afterEach(() => {
    globalForPrisma.prisma = originalPrisma;
  });

  await t.test('checkUniverseCoverage logs warning when symbols are missing in the session window', async () => {
    let callCount = 0;
    const mockQueryRaw = async (_query: any) => {
      callCount++;
      if (callCount === 1) {
        // SELECT DISTINCT date FROM "DailyOhlcv"
        return [
          { date: '2026-11-13' },
          { date: '2026-11-12' },
          { date: '2026-11-11' },
          { date: '2026-11-10' },
          { date: '2026-11-09' },
          { date: '2026-11-06' },
          { date: '2026-11-05' },
          { date: '2026-11-04' },
          { date: '2026-11-03' },
          { date: '2026-11-02' }
        ];
      }
      // SELECT DISTINCT symbol FROM "DailyOhlcv" - return all except TATASTEEL to simulate a missing symbol
      const activeSymbols = Array.from(FNO_SYMBOLS)
        .filter((s) => s !== 'TATASTEEL')
        .map((s) => ({ symbol: s }));
      return activeSymbols;
    };

    globalForPrisma.prisma = {
      $transaction: async (fn: any) => {
        return fn({
          $executeRawUnsafe: async () => {},
          $queryRaw: mockQueryRaw,
        });
      },
    };

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      warnings.push(args.join(' '));
    };

    try {
      const coverage = await MarketBreadthService.checkUniverseCoverage({ days: 10 });
      assert.ok(coverage.missingNifty50.includes('TATASTEEL'), 'TATASTEEL should be identified as missing from Nifty 50');
      assert.ok(coverage.missingFno.includes('TATASTEEL'), 'TATASTEEL should be identified as missing from FNO');
      assert.ok(
        warnings.some((w) => w.includes('[MarketBreadth] NIFTY50_SYMBOLS missing DailyOhlcv')),
        'Warning should be logged for NIFTY50_SYMBOLS'
      );
      assert.ok(
        warnings.some((w) => w.includes('[MarketBreadth] FNO_SYMBOLS missing DailyOhlcv')),
        'Warning should be logged for FNO_SYMBOLS'
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  await t.test('checkUniverseCoverage handles empty DB gracefully', async () => {
    globalForPrisma.prisma = {
      $transaction: async (fn: any) => {
        return fn({
          $executeRawUnsafe: async () => {},
          $queryRaw: async () => [],
        });
      },
    };

    const coverage = await MarketBreadthService.checkUniverseCoverage({ days: 10 });
    assert.deepStrictEqual(coverage, { missingNifty50: [], missingFno: [] });
  });
});
