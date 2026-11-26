import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrbWindowOpen, getISTTime } from '@/lib/market-hours';
import { evaluateOrbSetupStaleness } from '@/lib/cpr-setup-staleness';
import { ORB_CUTOFF_MINUTE } from '@/config/trading-constants';
import { ScannerService } from '@/services/scanner.service';
import { SignalService } from '@/services/signal.service';
import type { MarketStockData } from '@/services/market.service';

// Thursday 2026-11-26 (a trading day; NOTE 2026-11-24 is a market holiday in this codebase). IST = UTC + 5:30.
const istDate = (h: number, m: number) => new Date(Date.UTC(2026, 10, 26, 0, h * 60 + m - 330));

test('ORB_CUTOFF_MINUTE is 11:30 IST (690)', () => {
  assert.equal(ORB_CUTOFF_MINUTE, 690);
});

test('isOrbWindowOpen: open before 11:30 IST, closed from 11:30 on (live trading day)', () => {
  assert.equal(getISTTime(istDate(9, 40)).isTradingDay, true, 'precondition: trading day');
  assert.equal(isOrbWindowOpen(istDate(9, 40)), true);
  assert.equal(isOrbWindowOpen(istDate(11, 29)), true);
  assert.equal(isOrbWindowOpen(istDate(11, 30)), false);
  assert.equal(isOrbWindowOpen(istDate(12, 40)), false);
  assert.equal(isOrbWindowOpen(istDate(15, 20)), false);
});

test('isOrbWindowOpen: bypassed in replay (asOfDate), without a clock, and on non-trading days', () => {
  assert.equal(isOrbWindowOpen(istDate(12, 40), '2026-11-20'), true);
  assert.equal(isOrbWindowOpen(undefined), true);
  const saturday = new Date(Date.UTC(2026, 10, 28, 7, 10)); // Sat 12:40 IST
  assert.equal(isOrbWindowOpen(saturday), true);
});

const cpr = { pivot: 100, bc: 99, tc: 101, r1: 105, r2: 108, r3: 111, r4: 114, s1: 95, s2: 92, s3: 89, s4: 86 };
const openingRange = { orHigh: 101.5, orLow: 99.5, orMidpoint: 100.5, orRange: 2 };

test('computeTradeSetup: ORB_BREAKOUT only while the window is open; OR levels stay populated', () => {
  const base = {
    ltp: 102,
    cprToday: cpr,
    dayHigh: 102.5,
    dayLow: 99,
    openingRange,
    volumeRatio: 2,
    rawVolumeRatio: 2,
  };
  const open = ScannerService.computeTradeSetup({ ...base, orbWindowOpen: true });
  assert.equal(open.setupType, 'ORB_BREAKOUT');
  const dflt = ScannerService.computeTradeSetup(base);
  assert.equal(dflt.setupType, 'ORB_BREAKOUT', 'default keeps existing behavior');
  const closed = ScannerService.computeTradeSetup({ ...base, orbWindowOpen: false });
  assert.notEqual(closed.setupType, 'ORB_BREAKOUT');
  assert.equal(closed.setupType, 'CPR_PULLBACK');
  assert.deepEqual(closed.openingRange, openingRange, 'opening-range levels still returned for tracking');
});

function withMockedNow<T>(now: Date, fn: () => T): T {
  const RealDate = globalThis.Date;
  const originalFlag = process.env.FEATURE_PACE_VOLUME;
  // @ts-expect-error mocking Date for session simulation
  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(now.getTime());
      // @ts-expect-error delegate
      else super(...args);
    }
    static now() {
      return now.getTime();
    }
  };
  try {
    process.env.FEATURE_PACE_VOLUME = 'false';
    return fn();
  } finally {
    globalThis.Date = RealDate;
    process.env.FEATURE_PACE_VOLUME = originalFlag;
  }
}

const stock = (): MarketStockData => ({
  symbol: 'ORB_CUTOFF_TEST',
  market: 'NSE',
  sector: 'Energy',
  open: 100,
  high: 103,
  low: 99,
  close: 101,
  ltp: 102,
  volume: 2_000_000,
  avgVolume: 1_000_000,
  marketCap: 500000,
  rangeProvenance: 'INTRADAY_TODAY_BAR',
  candle15m: { open: 100, high: 103, low: 99, close: 102, volume: 5000 },
  openingCandle15m: { open: 100, high: 101.5, low: 99.5, close: 101, volume: 9000 },
});

test('SignalService emits ORB_LONG before 11:30 IST but not at 12:40 IST; CPR BREAKOUT stays', () => {
  const early = withMockedNow(istDate(9, 40), () => SignalService.getSignals(stock()));
  assert.ok(early.signals.includes('ORB_LONG'), 'control: ORB fires in the morning window');

  const late = withMockedNow(istDate(12, 40), () => SignalService.getSignals(stock()));
  assert.ok(!late.signals.includes('ORB_LONG'), 'no ORB_LONG after cut-off');
  assert.ok(!late.signals.includes('ORB_SHORT'));
  assert.ok(late.signals.includes('BREAKOUT'), 'CPR BREAKOUT unaffected by ORB cut-off');
});

test('evaluateOrbSetupStaleness continues to evaluate pre-cutoff ORB alert levels after cutoff', () => {
  const alertSetup = {
    orEntry: openingRange.orHigh,
    orHigh: openingRange.orHigh,
    orLow: openingRange.orLow,
    direction: 'LONG' as const,
    todayHigh: 102.5,
    todayLow: 99,
  };

  const activeCheck = evaluateOrbSetupStaleness({
    ...alertSetup,
    ltp: 101.8,
  });
  assert.equal(activeCheck.stale, false);

  // Evaluated when price is extended way past entry -> stale (EXTENDED)
  const extendedCheck = evaluateOrbSetupStaleness({
    ...alertSetup,
    ltp: 105.0,
  });
  assert.equal(extendedCheck.stale, true);
});

function captureInfo<T>(fn: () => T): { result: T; logs: string[] } {
  const original = console.info;
  const logs: string[] = [];
  console.info = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };
  try {
    return { result: fn(), logs };
  } finally {
    console.info = original;
  }
}

test('[OrbEvent] logs the first ORB hit per symbol/direction/day, tagged windowOpen, even after the cut-off', () => {
  const s1 = { ...stock(), symbol: 'ORB_EVT_EARLY' };
  const early = withMockedNow(istDate(9, 40), () => captureInfo(() => SignalService.getSignals(s1)));
  const e1 = early.logs.find((l) => l.startsWith('[OrbEvent]'));
  assert.ok(e1, 'event logged in the morning window');
  const p1 = JSON.parse(e1!.replace('[OrbEvent] ', ''));
  assert.equal(p1.windowOpen, true);
  assert.equal(p1.direction, 'LONG');

  const s2 = { ...stock(), symbol: 'ORB_EVT_LATE' };
  const late = withMockedNow(istDate(12, 40), () => captureInfo(() => SignalService.getSignals(s2)));
  assert.ok(!late.result.signals.includes('ORB_LONG'), 'signal still suppressed after cut-off');
  const e2 = late.logs.find((l) => l.startsWith('[OrbEvent]'));
  assert.ok(e2, 'late event still logged for analysis');
  assert.equal(JSON.parse(e2!.replace('[OrbEvent] ', '')).windowOpen, false);

  const again = withMockedNow(istDate(12, 45), () => captureInfo(() => SignalService.getSignals(s2)));
  assert.ok(!again.logs.some((l) => l.startsWith('[OrbEvent]')), 'no duplicate for same symbol/direction/day');
});

test('[OrbEvent] is not logged outside the session or in replay', () => {
  const s3 = { ...stock(), symbol: 'ORB_EVT_AFTER' };
  const after = withMockedNow(istDate(17, 30), () => captureInfo(() => SignalService.getSignals(s3)));
  assert.ok(!after.logs.some((l) => l.startsWith('[OrbEvent]')));
});
