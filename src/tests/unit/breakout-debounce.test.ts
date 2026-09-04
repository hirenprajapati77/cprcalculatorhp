 
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import {
  BreakoutWatcherService,
  BreakoutScanResult,
  breakoutAlertClaimKey,
} from '../../services/alert/breakout-watcher.service';
import { Prisma } from '@prisma/client';

describe('BreakoutWatcher Debounce & Flicker Prevention', () => {
  it('requires 2 consecutive misses before clearing breakout state and re-alerting', async () => {
    // 1. Save original Prisma methods
    const originalUpdateMany = prisma.breakoutAlertState.updateMany;
    const originalCreate = prisma.breakoutAlertState.create;
    const originalFindUnique = prisma.breakoutAlertState.findUnique;
    const originalUpdate = prisma.breakoutAlertState.update;

    // 2. Setup mock in-memory DB
    const mockDB: Array<{
      symbol: string;
      hadBreakout: boolean;
      missCount: number;
      lastAlerted: Date | null;
    }> = [];

    // Helper to throw unique constraint error
    function makeUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
      return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      });
    }

    // 3. Mock Prisma breakoutAlertState
    prisma.breakoutAlertState.updateMany = (async (args: any) => {
      const symbol = args.where.symbol;
      const hadBreakoutFilter = args.where.hadBreakout;
      const data = args.data;

      const row = mockDB.find(r => r.symbol === symbol);

      // Claim updates (hadBreakout: false)
      if (hadBreakoutFilter === false) {
        if (row && row.hadBreakout === false) {
          row.hadBreakout = data.hadBreakout;
          row.lastAlerted = data.lastAlerted;
          row.missCount = data.missCount ?? 0;
          return { count: 1 };
        }
        return { count: 0 };
      }

      // missCount reset updates (missCount: { gt: 0 })
      if (args.where.missCount && args.where.missCount.gt === 0) {
        if (row && row.missCount > 0) {
          row.missCount = data.missCount ?? 0;
          return { count: 1 };
        }
        return { count: 0 };
      }

      return { count: 0 };
    }) as any;

    prisma.breakoutAlertState.create = (async (args: any) => {
      const symbol = args.data.symbol;
      const row = mockDB.find(r => r.symbol === symbol);
      if (row) {
        throw makeUniqueConstraintError();
      }
      const newRow = {
        symbol,
        hadBreakout: args.data.hadBreakout ?? false,
        missCount: args.data.missCount ?? 0,
        lastAlerted: args.data.lastAlerted ?? null,
      };
      mockDB.push(newRow);
      return newRow;
    }) as any;

    prisma.breakoutAlertState.findUnique = (async (args: any) => {
      const symbol = args.where.symbol;
      const row = mockDB.find(r => r.symbol === symbol);
      return row ? row : null;
    }) as any;

    prisma.breakoutAlertState.update = (async (args: any) => {
      const symbol = args.where.symbol;
      const row = mockDB.find(r => r.symbol === symbol);
      if (!row) throw new Error('Not found');
      if (args.data.hadBreakout !== undefined) row.hadBreakout = args.data.hadBreakout;
      if (args.data.missCount !== undefined) row.missCount = args.data.missCount;
      if (args.data.lastAlerted !== undefined) row.lastAlerted = args.data.lastAlerted;
      return row;
    }) as any;

    try {
      const targetSymbol = 'PATANJALI';

      const makeScan = (hasBreakout: boolean): BreakoutScanResult[] => [
        {
          symbol: targetSymbol,
          signals: hasBreakout ? ['BREAKOUT'] : [],
          ltp: 350,
          entry: 354.8,
          sl: 353.03,
          target: 358.2,
          rr: '1:1.5',
          score: 80,
          sector: 'FMCG',
          eventRiskScore: 0,
        },
      ];

      // Test Cycle 1: BREAKOUT present -> Alert should be generated
      console.log('--- CYCLE 1: Breakout Present ---');
      const res1 = await BreakoutWatcherService.detectNewBreakouts(makeScan(true));
      assert.equal(res1.length, 1, 'Should alert on initial breakout');
      const state1 = mockDB.find(r => r.symbol === breakoutAlertClaimKey(targetSymbol, 'BREAKOUT'));
      assert.ok(state1, 'State row should be created');
      assert.equal(state1.hadBreakout, true, 'hadBreakout should be true');
      assert.equal(state1.missCount, 0, 'missCount should start at 0');

      // Test Cycle 2: BREAKOUT absent for 1 cycle -> Should NOT clear hadBreakout, should increment missCount to 1, no alert
      console.log('--- CYCLE 2: Breakout Absent (1st Miss) ---');
      const res2 = await BreakoutWatcherService.detectNewBreakouts(makeScan(false));
      assert.equal(res2.length, 0, 'Should not alert on a miss cycle');
      assert.equal(state1.hadBreakout, true, 'hadBreakout should remain true (debounce)');
      assert.equal(state1.missCount, 1, 'missCount should increment to 1');

      // Test Cycle 3: BREAKOUT present again -> Should NOT re-alert (still active), missCount should reset to 0
      console.log('--- CYCLE 3: Breakout Present Again (Flicker Recovery) ---');
      const res3 = await BreakoutWatcherService.detectNewBreakouts(makeScan(true));
      assert.equal(res3.length, 0, 'Should not re-alert on flicker recovery because hadBreakout stayed true');
      assert.equal(state1.hadBreakout, true, 'hadBreakout should remain true');
      assert.equal(state1.missCount, 0, 'missCount should reset to 0');

      // Test Cycle 4: BREAKOUT absent for 1 cycle (missCount -> 1)
      console.log('--- CYCLE 4: Breakout Absent (1st Miss Again) ---');
      const res4 = await BreakoutWatcherService.detectNewBreakouts(makeScan(false));
      assert.equal(res4.length, 0, 'Should not alert');
      assert.equal(state1.hadBreakout, true, 'hadBreakout should stay true');
      assert.equal(state1.missCount, 1, 'missCount should be 1');

      // Test Cycle 5: BREAKOUT absent for 2nd consecutive cycle (missCount -> 2) -> should clear hadBreakout to false
      console.log('--- CYCLE 5: Breakout Absent (2nd Miss - Debounce Exceeded) ---');
      const res5 = await BreakoutWatcherService.detectNewBreakouts(makeScan(false));
      assert.equal(res5.length, 0, 'Should not alert');
      assert.equal(state1.hadBreakout, false, 'hadBreakout should reset to false after 2 misses');
      assert.equal(state1.missCount, 0, 'missCount should reset to 0 on clear');

      // Test Cycle 6: BREAKOUT present again -> Should trigger a NEW alert!
      console.log('--- CYCLE 6: Breakout Present Again (Fresh Alert) ---');
      const res6 = await BreakoutWatcherService.detectNewBreakouts(makeScan(true));
      assert.equal(res6.length, 1, 'Should trigger a fresh alert since debounce cleared the state');
      assert.equal(state1.hadBreakout, true, 'hadBreakout should be true again');
      assert.equal(state1.missCount, 0, 'missCount should be 0');

    } finally {
      // Restore original Prisma methods
      prisma.breakoutAlertState.updateMany = originalUpdateMany;
      prisma.breakoutAlertState.create = originalCreate;
      prisma.breakoutAlertState.findUnique = originalFindUnique;
      prisma.breakoutAlertState.update = originalUpdate;
    }
  });

  it('deferClaim does not write lastAlerted; commitClaims does', async () => {
    const originalUpdateMany = prisma.breakoutAlertState.updateMany;
    const originalCreate = prisma.breakoutAlertState.create;
    const originalFindUnique = prisma.breakoutAlertState.findUnique;
    const originalUpdate = prisma.breakoutAlertState.update;

    const mockDB: Array<{
      symbol: string;
      hadBreakout: boolean;
      missCount: number;
      lastAlerted: Date | null;
    }> = [];

    prisma.breakoutAlertState.updateMany = (async (args: any) => {
      const symbol = args.where.symbol;
      const row = mockDB.find((r) => r.symbol === symbol);
      if (args.where.hadBreakout === false) {
        if (row && row.hadBreakout === false) {
          row.hadBreakout = args.data.hadBreakout;
          row.lastAlerted = args.data.lastAlerted;
          row.missCount = args.data.missCount ?? 0;
          return { count: 1 };
        }
        return { count: 0 };
      }
      if (args.where.missCount && args.where.missCount.gt === 0) {
        if (row && row.missCount > 0) {
          row.missCount = args.data.missCount ?? 0;
          return { count: 1 };
        }
        return { count: 0 };
      }
      return { count: 0 };
    }) as any;

    prisma.breakoutAlertState.create = (async (args: any) => {
      mockDB.push({
        symbol: args.data.symbol,
        hadBreakout: args.data.hadBreakout ?? false,
        missCount: args.data.missCount ?? 0,
        lastAlerted: args.data.lastAlerted ?? null,
      });
      return args.data;
    }) as any;

    prisma.breakoutAlertState.findUnique = (async (args: any) => {
      return mockDB.find((r) => r.symbol === args.where.symbol) ?? null;
    }) as any;

    prisma.breakoutAlertState.update = originalUpdate;

    try {
      const scan: BreakoutScanResult[] = [
        {
          symbol: 'RELIANCE',
          signals: ['BREAKOUT'],
          ltp: 1400,
          entry: 1395,
          sl: 1380,
          target: 1420,
          rr: '1:2',
          score: 88,
          sector: 'Energy',
          eventRiskScore: 0,
        },
      ];

      const preview = await BreakoutWatcherService.detectNewBreakouts(scan, { deferClaim: true });
      assert.equal(preview.length, 1);
      assert.equal(mockDB.length, 0, 'deferClaim must not insert a claim row');

      const committed = await BreakoutWatcherService.commitClaims(preview);
      assert.equal(committed.length, 1);
      assert.equal(mockDB.length, 1);
      assert.equal(mockDB[0]!.hadBreakout, true);
      assert.ok(mockDB[0]!.lastAlerted);
    } finally {
      prisma.breakoutAlertState.updateMany = originalUpdateMany;
      prisma.breakoutAlertState.create = originalCreate;
      prisma.breakoutAlertState.findUnique = originalFindUnique;
      prisma.breakoutAlertState.update = originalUpdate;
    }
  });
});
