import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@/lib/db';
import { BreakoutWatcherService } from '@/services/alert/breakout-watcher.service';
import { filterBreakoutsForPriceActionability } from '@/services/alert/breakout-price-gate';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';

describe('releaseStaleDeliveredClaims', () => {
  it('clears hadBreakout for extended/gap claims but keeps lastAlerted', async () => {
    const originalUpdateMany = prisma.breakoutAlertState.updateMany;
    let updateArgs: unknown = null;
    prisma.breakoutAlertState.updateMany = (async (args: unknown) => {
      updateArgs = args;
      return { count: 1 };
    }) as typeof prisma.breakoutAlertState.updateMany;

    try {
      const rows: BreakoutScanResult[] = [
        {
          symbol: 'NATIONALUM',
          signals: ['BREAKOUT'],
          ltp: 416.65,
          entry: 389.1,
          sl: 387,
          target: 393,
          rr: '1:2',
          score: 70,
          sector: 'Metals',
          high: 418,
          low: 388,
          open: 391,
          previousClose: 410,
        },
        {
          symbol: 'NORMAL',
          signals: ['BREAKOUT'],
          ltp: 100.5,
          entry: 100,
          sl: 99,
          target: 103,
          rr: '1:2',
          score: 80,
          sector: 'IT',
          high: 101,
          low: 99.5,
          open: 100,
          previousClose: 99.8,
        },
      ];

      const keys = await BreakoutWatcherService.releaseStaleDeliveredClaims(rows);
      assert.deepEqual(keys, ['NATIONALUM:BREAKOUT']);
      assert.ok(updateArgs);
      const args = updateArgs as {
        where: { symbol: { in: string[] }; hadBreakout: boolean };
        data: { hadBreakout: boolean; lastAlerted?: null };
      };
      assert.deepEqual(args.where.symbol.in, ['NATIONALUM:BREAKOUT']);
      assert.equal(args.where.hadBreakout, true);
      assert.equal(args.data.hadBreakout, false);
      assert.equal(
        'lastAlerted' in args.data,
        false,
        'must preserve lastAlerted (cooldown) for already-delivered stale alerts'
      );
    } finally {
      prisma.breakoutAlertState.updateMany = originalUpdateMany;
    }
  });
});

describe('test-breakout fixtures vs price gate', () => {
  it('near-entry BHEL/SBIN fixtures remain actionable', () => {
    const fixtures: BreakoutScanResult[] = [
      {
        symbol: 'BHEL',
        signals: ['BREAKOUT'],
        alertKind: 'BREAKOUT',
        ltp: 414.35,
        entry: 415.0,
        sl: 403.85,
        target: 433.82,
        rr: '1:1.9',
        score: 100,
        sector: 'Capital Goods',
        high: 416,
        low: 410,
        open: 412,
        previousClose: 411,
      },
      {
        symbol: 'SBIN',
        signals: ['BREAKOUT'],
        alertKind: 'BREAKOUT',
        ltp: 802.5,
        entry: 803.0,
        sl: 792.1,
        target: 825.6,
        rr: '1:2.1',
        score: 95,
        sector: 'Banking',
        high: 805,
        low: 798,
        open: 800,
        previousClose: 799,
      },
    ];
    const { actionable, suppressed } = filterBreakoutsForPriceActionability(fixtures);
    assert.equal(suppressed.length, 0);
    assert.equal(actionable.length, 2);
  });
});
