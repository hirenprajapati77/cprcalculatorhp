import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakoutAlertClaimKey,
  BreakoutWatcherService,
} from '@/services/alert/breakout-watcher.service';

describe('breakout-watcher helpers (Tier 2)', () => {
  it('generates consistent claim keys for BREAKOUT and BREAKDOWN', () => {
    assert.equal(breakoutAlertClaimKey('RELIANCE', 'BREAKOUT'), 'RELIANCE:BREAKOUT');
    assert.equal(breakoutAlertClaimKey('INFY', 'BREAKDOWN'), 'INFY:BREAKDOWN');
  });

  it('no-ops safely when empty arrays are passed to claim modifiers', async () => {
    await assert.doesNotReject(async () => {
      await BreakoutWatcherService.releaseClaims([]);
      await BreakoutWatcherService.suppressClaims([]);
      const stale = await BreakoutWatcherService.releaseStaleDeliveredClaims([]);
      assert.deepEqual(stale, []);
    });
  });

  it('releaseClaims and suppressClaims expand bare symbols to both BREAKOUT and BREAKDOWN keys', async () => {
    const { prisma } = await import('@/lib/db');
    const origUpdateMany = prisma.breakoutAlertState.updateMany;
    let updatedKeys: string[] = [];

    (prisma.breakoutAlertState as any).updateMany = async ({ where }: any) => {
      updatedKeys = where.symbol.in;
      return { count: updatedKeys.length };
    };

    try {
      await BreakoutWatcherService.releaseClaims(['TCS']);
      assert.ok(updatedKeys.includes('TCS:BREAKOUT'));
      assert.ok(updatedKeys.includes('TCS:BREAKDOWN'));

      await BreakoutWatcherService.suppressClaims(['INFY:BREAKOUT', 'WIPRO']);
      assert.ok(updatedKeys.includes('INFY:BREAKOUT'));
      assert.ok(updatedKeys.includes('WIPRO:BREAKOUT'));
      assert.ok(updatedKeys.includes('WIPRO:BREAKDOWN'));
    } finally {
      prisma.breakoutAlertState.updateMany = origUpdateMany;
    }
  });

  it('detectNewBreakouts suppresses alerts with low score, high event risk, or live sector divergence', async () => {
    const { prisma } = await import('@/lib/db');
    const { env } = await import('@/config/env');
    const origFindUnique = prisma.breakoutAlertState.findUnique;
    const origUpdateMany = prisma.breakoutAlertState.updateMany;
    const origCreate = prisma.breakoutAlertState.create;
    const origSectorMode = env.SECTOR_FILTER_MODE;

    (prisma.breakoutAlertState as any).findUnique = async () => null;
    (prisma.breakoutAlertState as any).updateMany = async () => ({ count: 1 });
    (prisma.breakoutAlertState as any).create = async () => ({ id: '1' });

    try {
      // 1. Score < 75 (near miss)
      const nearMiss = await BreakoutWatcherService.detectNewBreakouts([
        {
          symbol: 'LOW_SCORE',
          signals: ['BREAKOUT'],
          ltp: 100,
          entry: 100,
          sl: 98,
          target: 104,
          rr: '1:2',
          score: 70, // < 75
          sector: 'IT',
        },
      ]);
      assert.equal(nearMiss.length, 0);

      // 2. Event risk >= 80
      const highRisk = await BreakoutWatcherService.detectNewBreakouts([
        {
          symbol: 'HIGH_RISK',
          signals: ['BREAKOUT'],
          ltp: 100,
          entry: 100,
          sl: 98,
          target: 104,
          rr: '1:2',
          score: 85,
          sector: 'IT',
          eventRiskScore: 85,
        },
      ]);
      assert.equal(highRisk.length, 0);

      // 3. Sector divergence in live mode vs shadow mode
      env.SECTOR_FILTER_MODE = 'live';
      const divLive = await BreakoutWatcherService.detectNewBreakouts([
        {
          symbol: 'DIV_STOCK',
          signals: ['BREAKOUT', 'SECTOR_DIVERGENCE'],
          ltp: 100,
          entry: 100,
          sl: 98,
          target: 104,
          rr: '1:2',
          score: 85,
          sector: 'IT',
        },
      ]);
      assert.equal(divLive.length, 0);

      env.SECTOR_FILTER_MODE = 'shadow';
      const divShadow = await BreakoutWatcherService.detectNewBreakouts([
        {
          symbol: 'DIV_STOCK',
          signals: ['BREAKOUT', 'SECTOR_DIVERGENCE'],
          ltp: 100,
          entry: 100,
          sl: 98,
          target: 104,
          rr: '1:2',
          score: 85,
          sector: 'IT',
        },
      ], { deferClaim: true });
      assert.equal(divShadow.length, 1);
      assert.equal(divShadow[0].alertKind, 'BREAKOUT');
    } finally {
      prisma.breakoutAlertState.findUnique = origFindUnique;
      prisma.breakoutAlertState.updateMany = origUpdateMany;
      prisma.breakoutAlertState.create = origCreate;
      env.SECTOR_FILTER_MODE = origSectorMode;
    }
  });

  it('commitClaims commits claims for actionable breakout rows', async () => {
    const { prisma } = await import('@/lib/db');
    const origUpdateMany = prisma.breakoutAlertState.updateMany;
    let callCount = 0;

    (prisma.breakoutAlertState as any).updateMany = async () => {
      callCount++;
      return { count: 1 };
    };

    try {
      const rows = [
        {
          symbol: 'CLAIM_1',
          signals: ['BREAKOUT'],
          alertKind: 'BREAKOUT' as const,
          ltp: 100,
          entry: 100,
          sl: 98,
          target: 104,
          rr: '1:2',
          score: 85,
          sector: 'IT',
        },
      ];
      const claimed = await BreakoutWatcherService.commitClaims(rows);
      assert.equal(claimed.length, 1);
      assert.equal(claimed[0].symbol, 'CLAIM_1');
      assert.ok(callCount >= 1);
    } finally {
      prisma.breakoutAlertState.updateMany = origUpdateMany;
    }
  });
});
