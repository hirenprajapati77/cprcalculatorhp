import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/db';
import { BreakoutWatcherService } from '../services/alert/breakout-watcher.service';

// ─── In-process deduplication logic (mirrors BreakoutWatcherService) ──────────
// We test the pure logic without hitting Prisma (which needs a live DB connection).

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
 * Pure function version of detectNewBreakouts for unit testing.
 * Same logic as BreakoutWatcherService.detectNewBreakouts, but takes
 * an in-memory state map instead of Prisma — so we can test without DB.
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

const makeScanResult = (symbol: string, hasBreakout: boolean): ScanResult => ({
  symbol,
  signals: hasBreakout ? ['NARROW', 'BREAKOUT'] : ['NARROW'],
  ltp: 500,
  entry: 502,
  sl: 492,
  target: 522,
  rr: '1:2.0',
  score: 85,
  sector: 'Banking'
});

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

  await t.test('BreakoutWatcherService skips alert if DB read throws', async () => {
    const originalFindUnique = prisma.breakoutAlertState.findUnique;
    const originalUpsert = prisma.breakoutAlertState.upsert;
    let upsertCalled = false;
    
    prisma.breakoutAlertState.findUnique = (async () => {
      throw new Error('Simulated DB connection error');
    }) as unknown as typeof prisma.breakoutAlertState.findUnique;

    prisma.breakoutAlertState.upsert = (async (args: unknown) => {
      upsertCalled = true;
      if (typeof args === 'object' && args !== null && 'update' in args) {
        const updateArgs = args.update as { lastAlerted?: Date };
        assert.ok(updateArgs, 'should have update block');
        assert.strictEqual(updateArgs.lastAlerted, undefined, 'should not update lastAlerted');
      }
      return { symbol: 'SBIN', hadBreakout: true, lastAlerted: null } as unknown as Awaited<ReturnType<typeof prisma.breakoutAlertState.upsert>>;
    }) as unknown as typeof prisma.breakoutAlertState.upsert;
    
    try {
      const scan = [makeScanResult('SBIN', true)]; // has BREAKOUT
      const results = await BreakoutWatcherService.detectNewBreakouts(scan);
      
      assert.strictEqual(results.length, 0, 'Should not return any new breakouts due to state read failure');
      assert.strictEqual(upsertCalled, true, 'Should still update DB with current state');
    } finally {
      prisma.breakoutAlertState.findUnique = originalFindUnique;
      prisma.breakoutAlertState.upsert = originalUpsert;
    }
  });
});
