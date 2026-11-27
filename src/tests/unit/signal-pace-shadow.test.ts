import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalService } from '@/services/signal.service';
import type { MarketStockData } from '@/services/market.service';

test('Pace shadow logs divergent symbols but never changes live volumeRatio when flag is off', () => {
  const originalFlag = process.env.FEATURE_PACE_VOLUME;
  const originalInfo = console.info;
  const RealDate = globalThis.Date;
  const mockNow = new RealDate('2026-11-26T04:05:00.000Z'); // 09:35 IST, Thursday
  const logs: string[] = [];

  // @ts-expect-error mocking Date for session simulation
  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(mockNow.getTime());
      // @ts-expect-error delegate
      else super(...args);
    }
    static now() {
      return mockNow.getTime();
    }
  };
  console.info = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };

  try {
    process.env.FEATURE_PACE_VOLUME = 'false';
    const stock: MarketStockData = {
      symbol: 'SHADOW_TEST',
      market: 'NSE',
      sector: 'Energy',
      open: 100,
      high: 103,
      low: 99,
      close: 101,
      ltp: 102,
      volume: 78000,
      avgVolume: 1000000,
      marketCap: 500000,
      rangeProvenance: 'INTRADAY_TODAY_BAR',
      candle15m: { open: 100, high: 103, low: 99, close: 102, volume: 5000 },
    };
    const res = SignalService.getSignals(stock);
    assert.strictEqual(res.volumeRatio, res.rawVolumeRatio, 'live ratio must stay raw while flag is off');
    const line = logs.find((l) => l.startsWith('[PaceShadow]'));
    assert.ok(line, 'expected a [PaceShadow] log line');
    const payload = JSON.parse(line!.replace('[PaceShadow] ', ''));
    assert.strictEqual(payload.symbol, 'SHADOW_TEST');
    assert.ok(payload.pace >= 1.5 && payload.raw < 1.5);
    assert.ok(payload.gained.includes('BREAKOUT'), 'log only signals pace would add');
    assert.ok(!res.signals.includes('BREAKOUT'), 'live signals unchanged');
  } finally {
    globalThis.Date = RealDate;
    console.info = originalInfo;
    process.env.FEATURE_PACE_VOLUME = originalFlag;
  }
});

test('Pace shadow stays silent when volume diverges but no breakout/ORB would be added', () => {
  const originalFlag = process.env.FEATURE_PACE_VOLUME;
  const originalInfo = console.info;
  const RealDate = globalThis.Date;
  const mockNow = new RealDate('2026-11-26T04:05:00.000Z');
  const logs: string[] = [];

  // @ts-expect-error mocking Date for session simulation
  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(mockNow.getTime());
      // @ts-expect-error delegate
      else super(...args);
    }
    static now() {
      return mockNow.getTime();
    }
  };
  console.info = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };

  try {
    process.env.FEATURE_PACE_VOLUME = 'false';
    const stock: MarketStockData = {
      symbol: 'SHADOW_QUIET',
      market: 'NSE',
      sector: 'Energy',
      open: 100,
      high: 103,
      low: 99,
      close: 101,
      ltp: 101, // inside CPR: no breakout even with pace volume
      volume: 78000,
      avgVolume: 1000000,
      marketCap: 500000,
      rangeProvenance: 'INTRADAY_TODAY_BAR',
      candle15m: { open: 100, high: 102, low: 100, close: 101, volume: 5000 },
    };
    SignalService.getSignals(stock);
    assert.strictEqual(logs.filter((l) => l.startsWith('[PaceShadow]')).length, 0);
  } finally {
    globalThis.Date = RealDate;
    console.info = originalInfo;
    process.env.FEATURE_PACE_VOLUME = originalFlag;
  }
});

function runShadow(volume: number, symbol: string): { logs: string[]; live: string[] } {
  const originalFlag = process.env.FEATURE_PACE_VOLUME;
  const originalInfo = console.info;
  const RealDate = globalThis.Date;
  const mockNow = new RealDate('2026-11-26T04:05:00.000Z'); // Thu 09:35 IST, trading day
  const logs: string[] = [];

  // @ts-expect-error mocking Date for session simulation
  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(mockNow.getTime());
      // @ts-expect-error delegate
      else super(...args);
    }
    static now() {
      return mockNow.getTime();
    }
  };
  console.info = (...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  };
  try {
    process.env.FEATURE_PACE_VOLUME = 'false';
    const stock: MarketStockData = {
      symbol,
      market: 'NSE',
      sector: 'Energy',
      open: 100,
      high: 103,
      low: 99,
      close: 101,
      ltp: 102,
      volume,
      avgVolume: 1000000,
      marketCap: 500000,
      rangeProvenance: 'INTRADAY_TODAY_BAR',
      candle15m: { open: 100, high: 103, low: 99, close: 102, volume: 5000 },
    };
    const res = SignalService.getSignals(stock);
    return { logs, live: res.signals };
  } finally {
    globalThis.Date = RealDate;
    console.info = originalInfo;
    process.env.FEATURE_PACE_VOLUME = originalFlag;
  }
}

const shadowPayload = (logs: string[]) => {
  const line = logs.find((l) => l.startsWith('[PaceShadow]'));
  return line ? JSON.parse(line.replace('[PaceShadow] ', '')) : null;
};

test('Curve v1 would confirm but v2 would not (raw 0.15 at 09:35): logs gained[] only, live signals unchanged', () => {
  const { logs, live } = runShadow(150000, 'V2_DISAGREE');
  const p = shadowPayload(logs);
  assert.ok(p, 'expected a [PaceShadow] line');
  assert.ok(p.gained.includes('BREAKOUT'));
  assert.deepEqual(p.gainedV2, []);
  assert.ok(p.pace >= 1.5 && p.paceV2 < 1.5);
  assert.equal(p.expectedV2, 0.1269);
  assert.ok(!live.includes('BREAKOUT'), 'live signals untouched');
});

test('Both curves would confirm (raw 0.26 at 09:35): both gained arrays carry BREAKOUT', () => {
  const { logs } = runShadow(260000, 'V2_AGREE');
  const p = shadowPayload(logs);
  assert.ok(p);
  assert.ok(p.gained.includes('BREAKOUT'));
  assert.ok(p.gainedV2.includes('BREAKOUT'));
});
