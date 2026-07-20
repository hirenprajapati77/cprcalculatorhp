import test from 'node:test';
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BreakoutWatcherService } from '../../services/alert/breakout-watcher.service';

// ─── Legacy in-memory shadow (NOT production logic) ───────────────────────────
// detectNewBreakoutsPure omits score thresholds, atomic updateMany/create claim,
// and P2002 retry — kept only for coarse transition/dedup smoke checks.

interface BreakoutState {
  hadBreakout: boolean;
  lastAlerted: Date | null;
}

interface ScanResult {
  symbol: string;
  signals: string[];
  ltp: number;
  entry: number;
  sl: number;
  target: number;
  rr: string;
  score: number;
  sector: string;
}

/**
 * Legacy shadow of pre-atomic dedup logic. Does NOT mirror production
 * BreakoutWatcherService.detectNewBreakouts (no score gate, no atomic claim).
 */
function detectNewBreakoutsPure(
  scanResults: ScanResult[],
  stateMap: Map<string, BreakoutState>
): { newBreakouts: ScanResult[]; updatedState: Map<string, BreakoutState> } {
  const newBreakouts: ScanResult[] = [];
  const updatedState = new Map<string, BreakoutState>(stateMap);

  for (const result of scanResults) {
    const hasBreakoutNow = result.signals.includes('BREAKOUT');
    const prev = updatedState.get(result.symbol);
    const hadBreakoutBefore = prev?.hadBreakout ?? false;

    if (hasBreakoutNow && !hadBreakoutBefore) {
      newBreakouts.push(result);
    }

    const isNewAlert = hasBreakoutNow && !hadBreakoutBefore;
    updatedState.set(result.symbol, {
      hadBreakout: hasBreakoutNow,
      lastAlerted: isNewAlert ? new Date() : (prev?.lastAlerted ?? null)
    });
  }

  return { newBreakouts, updatedState };
}

const makeScanResult = (
  symbol: string,
  hasBreakout: boolean,
  score = 85
): ScanResult => ({
  symbol,
  signals: hasBreakout ? ['NARROW', 'BREAKOUT'] : ['NARROW'],
  ltp: 500,
  entry: 502,
  sl: 492,
  target: 522,
  rr: '1:2.0',
  score,
  sector: 'Banking'
});

function makeUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    { code: 'P2002', clientVersion: '6.19.3' }
  );
}

type BreakoutPrismaMocks = {
  restore: () => void;
  updateManyCalls: unknown[];
  createCalls: unknown[];
  findUniqueCalls: unknown[];
  upsertCalls: unknown[];
};

function mockBreakoutPrisma(handlers: {
  updateMany?: (args: unknown) => Promise<{ count: number }>;
  create?: (args: unknown) => Promise<unknown>;
  findUnique?: (args: unknown) => Promise<{ hadBreakout: boolean } | null>;
  upsert?: (args: unknown) => Promise<unknown>;
}): BreakoutPrismaMocks {
  const originalUpdateMany = prisma.breakoutAlertState.updateMany;
  const originalCreate = prisma.breakoutAlertState.create;
  const originalFindUnique = prisma.breakoutAlertState.findUnique;
  const originalUpsert = prisma.breakoutAlertState.upsert;

  const updateManyCalls: unknown[] = [];
  const createCalls: unknown[] = [];
  const findUniqueCalls: unknown[] = [];
  const upsertCalls: unknown[] = [];

  prisma.breakoutAlertState.updateMany = (async (args: unknown) => {
    updateManyCalls.push(args);
    if (handlers.updateMany) {
      return handlers.updateMany(args);
    }
    return { count: 0 };
  }) as unknown as typeof prisma.breakoutAlertState.updateMany;

  prisma.breakoutAlertState.create = (async (args: unknown) => {
    createCalls.push(args);
    if (handlers.create) {
      return handlers.create(args);
    }
    return { symbol: 'MOCK', hadBreakout: true, lastAlerted: new Date() };
  }) as unknown as typeof prisma.breakoutAlertState.create;

  prisma.breakoutAlertState.findUnique = (async (args: unknown) => {
    findUniqueCalls.push(args);
    if (handlers.findUnique) {
      return handlers.findUnique(args);
    }
    return null;
  }) as unknown as typeof prisma.breakoutAlertState.findUnique;

  prisma.breakoutAlertState.upsert = (async (args: unknown) => {
    upsertCalls.push(args);
    if (handlers.upsert) {
      return handlers.upsert(args);
    }
    return { symbol: 'MOCK', hadBreakout: false, lastAlerted: null };
  }) as unknown as typeof prisma.breakoutAlertState.upsert;

  return {
    updateManyCalls,
    createCalls,
    findUniqueCalls,
    upsertCalls,
    restore: () => {
      prisma.breakoutAlertState.updateMany = originalUpdateMany;
      prisma.breakoutAlertState.create = originalCreate;
      prisma.breakoutAlertState.findUnique = originalFindUnique;
      prisma.breakoutAlertState.upsert = originalUpsert;
    },
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test('BreakoutWatcher — deduplication logic', async (t) => {

  await t.test('first time a symbol shows BREAKOUT → detected as new, included in newBreakouts', () => {
    const state = new Map<string, BreakoutState>();
    const scan1 = [makeScanResult('SBIN', true)];

    const { newBreakouts, updatedState } = detectNewBreakoutsPure(scan1, state);

    assert.strictEqual(newBreakouts.length, 1, 'should detect 1 new breakout');
    assert.strictEqual(newBreakouts[0].symbol, 'SBIN');
    assert.strictEqual(updatedState.get('SBIN')?.hadBreakout, true);
    assert.ok(updatedState.get('SBIN')?.lastAlerted instanceof Date);
  });

  await t.test('same symbol still showing BREAKOUT on next scan → NOT re-detected (dedup works)', () => {
    // Scan 1: SBIN breaks out
    const state = new Map<string, BreakoutState>();
    const scan1 = [makeScanResult('SBIN', true)];
    const { updatedState: afterScan1 } = detectNewBreakoutsPure(scan1, state);

    // Scan 2: SBIN still has BREAKOUT — should NOT fire again
    const scan2 = [makeScanResult('SBIN', true)];
    const { newBreakouts, updatedState: afterScan2 } = detectNewBreakoutsPure(scan2, afterScan1);

    assert.strictEqual(newBreakouts.length, 0, 'should NOT re-alert for existing BREAKOUT');
    assert.strictEqual(afterScan2.get('SBIN')?.hadBreakout, true, 'state should still show hadBreakout=true');
  });

  await t.test('symbol loses BREAKOUT then regains it → detected as new again (transition tracking)', () => {
    // Scan 1: SBIN has BREAKOUT
    const state = new Map<string, BreakoutState>();
    const { updatedState: s1 } = detectNewBreakoutsPure([makeScanResult('SBIN', true)], state);

    // Scan 2: SBIN loses BREAKOUT
    const { updatedState: s2 } = detectNewBreakoutsPure([makeScanResult('SBIN', false)], s1);
    assert.strictEqual(s2.get('SBIN')?.hadBreakout, false, 'state should clear after signal gone');

    // Scan 3: SBIN has BREAKOUT again → should alert again
    const { newBreakouts: nb3 } = detectNewBreakoutsPure([makeScanResult('SBIN', true)], s2);
    assert.strictEqual(nb3.length, 1, 'should detect BREAKOUT again after it cleared');
    assert.strictEqual(nb3[0].symbol, 'SBIN');
  });

  await t.test('resetDailyState clears hadBreakout flags (simulated)', () => {
    // Simulate state where SBIN had a breakout
    const state = new Map<string, BreakoutState>([
      ['SBIN', { hadBreakout: true, lastAlerted: new Date() }],
      ['RELIANCE', { hadBreakout: true, lastAlerted: new Date() }],
      ['TCS', { hadBreakout: false, lastAlerted: null }]
    ]);

    // Simulate resetDailyState: clear all hadBreakout
    for (const [sym, val] of state.entries()) {
      state.set(sym, { ...val, hadBreakout: false });
    }

    assert.strictEqual(state.get('SBIN')?.hadBreakout, false, 'SBIN should be reset');
    assert.strictEqual(state.get('RELIANCE')?.hadBreakout, false, 'RELIANCE should be reset');
    assert.strictEqual(state.get('TCS')?.hadBreakout, false, 'TCS should stay false');

    // Now after reset, SBIN breaking out again should fire as new
    const { newBreakouts } = detectNewBreakoutsPure([makeScanResult('SBIN', true)], state);
    assert.strictEqual(newBreakouts.length, 1, 'should detect SBIN as new breakout after daily reset');
  });

  await t.test('stock with no BREAKOUT signal never triggers an alert', () => {
    const state = new Map<string, BreakoutState>();
    const scans = [
      makeScanResult('INFY', false),
      makeScanResult('HDFC', false),
      makeScanResult('WIPRO', false)
    ];

    const { newBreakouts } = detectNewBreakoutsPure(scans, state);
    assert.strictEqual(newBreakouts.length, 0, 'no BREAKOUT signal → zero alerts');
  });

  await t.test('multiple symbols — only new breakouts are returned, not existing ones', () => {
    // Pre-seed: SBIN already had breakout, RELIANCE is new
    const state = new Map<string, BreakoutState>([
      ['SBIN', { hadBreakout: true, lastAlerted: new Date() }]
    ]);

    const scan = [
      makeScanResult('SBIN', true),     // existing — should NOT alert
      makeScanResult('RELIANCE', true), // new — should alert
      makeScanResult('TCS', false),     // no signal — should NOT alert
    ];

    const { newBreakouts } = detectNewBreakoutsPure(scan, state);
    assert.strictEqual(newBreakouts.length, 1, 'only RELIANCE should be new');
    assert.strictEqual(newBreakouts[0].symbol, 'RELIANCE');
  });

  await t.test('empty scan result → empty newBreakouts, no state mutations', () => {
    const state = new Map<string, BreakoutState>([
      ['SBIN', { hadBreakout: true, lastAlerted: new Date() }]
    ]);

    const { newBreakouts, updatedState } = detectNewBreakoutsPure([], state);
    assert.strictEqual(newBreakouts.length, 0);
    // SBIN state unchanged
    assert.strictEqual(updatedState.get('SBIN')?.hadBreakout, true);
  });

  await t.test('BreakoutWatcherService skips alert if atomic claim throws', async () => {
    const mocks = mockBreakoutPrisma({
      updateMany: async () => {
        throw new Error('Simulated DB connection error');
      },
      upsert: async (args: unknown) => {
        if (typeof args === 'object' && args !== null && 'update' in args) {
          const updateArgs = args.update as { lastAlerted?: Date };
          assert.strictEqual(updateArgs.lastAlerted, undefined, 'should not update lastAlerted');
        }
        return { symbol: 'SBIN', hadBreakout: true, lastAlerted: null };
      },
    });

    try {
      const scan = [makeScanResult('SBIN', true)];
      const results = await BreakoutWatcherService.detectNewBreakouts(scan);

      assert.strictEqual(results.length, 0, 'Should not return any new breakouts due to claim failure');
      assert.strictEqual(mocks.updateManyCalls.length, 1, 'Should attempt atomic claim');
      assert.strictEqual(mocks.upsertCalls.length, 1, 'Should still update DB with current state');
    } finally {
      mocks.restore();
    }
  });
});

test('BreakoutWatcher — atomic claim path (production Prisma mocks)', async (t) => {
  await t.test('clean claim: updateMany count 1 → new breakout, create never called', async () => {
    const mocks = mockBreakoutPrisma({
      updateMany: async () => ({ count: 1 }),
    });

    try {
      const results = await BreakoutWatcherService.detectNewBreakouts([
        makeScanResult('SBIN', true),
      ]);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].symbol, 'SBIN');
      assert.strictEqual(mocks.updateManyCalls.length, 1);
      assert.strictEqual(mocks.createCalls.length, 0);
      assert.strictEqual(mocks.findUniqueCalls.length, 0);
      assert.strictEqual(mocks.upsertCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('no existing row: updateMany 0 then create succeeds → new breakout once', async () => {
    const mocks = mockBreakoutPrisma({
      updateMany: async () => ({ count: 0 }),
      create: async () => ({ symbol: 'RELIANCE', hadBreakout: true, lastAlerted: new Date() }),
    });

    try {
      const results = await BreakoutWatcherService.detectNewBreakouts([
        makeScanResult('RELIANCE', true),
      ]);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].symbol, 'RELIANCE');
      assert.strictEqual(mocks.updateManyCalls.length, 1);
      assert.strictEqual(mocks.createCalls.length, 1);
    } finally {
      mocks.restore();
    }
  });

  await t.test('concurrent winner: P2002 on create, retry updateMany count 1 → new breakout', async () => {
    let updateManyCall = 0;
    const mocks = mockBreakoutPrisma({
      updateMany: async () => {
        updateManyCall += 1;
        return { count: updateManyCall === 2 ? 1 : 0 };
      },
      create: async () => {
        throw makeUniqueConstraintError();
      },
    });

    try {
      const results = await BreakoutWatcherService.detectNewBreakouts([
        makeScanResult('TCS', true),
      ]);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].symbol, 'TCS');
      assert.strictEqual(mocks.updateManyCalls.length, 2);
      assert.strictEqual(mocks.createCalls.length, 1);
    } finally {
      mocks.restore();
    }
  });

  await t.test('concurrent loser: P2002 on create, retry updateMany count 0 → NOT new breakout', async () => {
    const mocks = mockBreakoutPrisma({
      updateMany: async () => ({ count: 0 }),
      create: async () => {
        throw makeUniqueConstraintError();
      },
      findUnique: async () => ({ hadBreakout: true }),
      upsert: async () => ({ symbol: 'INFY', hadBreakout: true, lastAlerted: new Date() }),
    });

    try {
      const results = await BreakoutWatcherService.detectNewBreakouts([
        makeScanResult('INFY', true),
      ]);

      assert.strictEqual(
        results.length,
        0,
        'loser in concurrent race must not emit a duplicate breakout alert'
      );
      assert.strictEqual(mocks.updateManyCalls.length, 2);
      assert.strictEqual(mocks.createCalls.length, 1);
      assert.strictEqual(mocks.findUniqueCalls.length, 1);
      assert.strictEqual(mocks.upsertCalls.length, 1);
    } finally {
      mocks.restore();
    }
  });

  await t.test('weak breakout: score < 75 → no updateMany/create, legacy upsert does not lock', async () => {
    const mocks = mockBreakoutPrisma({
      findUnique: async () => null,
      upsert: async () => ({ symbol: 'HDFC', hadBreakout: false, lastAlerted: null }),
    });

    try {
      const results = await BreakoutWatcherService.detectNewBreakouts([
        makeScanResult('HDFC', true, 70),
      ]);

      assert.strictEqual(results.length, 0);
      assert.strictEqual(mocks.updateManyCalls.length, 0);
      assert.strictEqual(mocks.createCalls.length, 0);
      assert.strictEqual(mocks.findUniqueCalls.length, 1);
      assert.strictEqual(mocks.upsertCalls.length, 1);

      const upsertArgs = mocks.upsertCalls[0] as {
        create: { hadBreakout: boolean };
        update: { hadBreakout: boolean };
      };
      assert.strictEqual(upsertArgs.create.hadBreakout, false);
      assert.strictEqual(upsertArgs.update.hadBreakout, false);
    } finally {
      mocks.restore();
    }
  });
});
