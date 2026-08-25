import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import {
  persistBreakoutAlertSuppressions,
  clearBreakoutAlertSuppressions,
} from '@/services/alert/breakout-suppression.persist';

describe('breakout-suppression.persist', () => {
  it('writes and clears suppression on ScannerResult by symbol+date', async () => {
    const date = '2026-08-17-test';
    const symbol = 'TESTSUPP';
    const originalUpdateMany = prisma.scannerResult.updateMany;
    const calls: Array<{ where: unknown; data: unknown }> = [];

    prisma.scannerResult.updateMany = (async (args: unknown) => {
      calls.push(args as { where: unknown; data: unknown });
      return { count: 1 };
    }) as unknown as typeof prisma.scannerResult.updateMany;

    try {
      await persistBreakoutAlertSuppressions(
        [{ symbol, reason: 'EXTENDED', detail: 'LTP +5.0% vs entry (cap 3.5%)' }],
        date
      );
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0]?.where, {
        date,
        OR: [{ symbol: 'TESTSUPP' }, { symbol: 'TESTSUPP:BSE' }],
      });
      assert.equal((calls[0]?.data as Record<string, unknown>)?.alertSuppressedReason, 'EXTENDED');

      calls.length = 0;
      await clearBreakoutAlertSuppressions([symbol], date);
      assert.equal(calls.length, 1);
      assert.equal((calls[0]?.data as Record<string, unknown>)?.alertSuppressedReason, null);
    } finally {
      prisma.scannerResult.updateMany = originalUpdateMany;
    }
  });
});
