import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalService } from '@/services/signal.service';
import type { MarketStockData } from '@/services/market.service';

test('End-to-end Breakout vs ORB Volume Floor Isolation', async (t) => {
  const originalPaceFlag = process.env.FEATURE_PACE_VOLUME;
  const RealDate = globalThis.Date;

  // Mock wall-clock at 09:35 IST on Thursday 2026-11-26 (09:35 session time, progress fraction ~0.0512)
  // 09:35 IST = 04:05 UTC
  const mockNow = new RealDate('2026-11-26T04:05:00.000Z');

  function installMockDate() {
    // @ts-expect-error Mocking global Date constructor for session simulation
    globalThis.Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow.getTime());
        } else {
          // @ts-expect-error delegating constructor arguments
          super(...args);
        }
      }
      static now() {
        return mockNow.getTime();
      }
    };
  }

  t.afterEach(() => {
    process.env.FEATURE_PACE_VOLUME = originalPaceFlag;
    globalThis.Date = RealDate;
  });

  await t.test(
    'CPR BREAKOUT confirms when pace volume ratio >= 1.5 even if raw volume ratio < 0.08, while ORB is blocked',
    () => {
      process.env.FEATURE_PACE_VOLUME = 'true';
      installMockDate();

      // Setting: at 09:35 IST, expected volume fraction is ~0.0512.
      // With volume = 78,000 and avgVolume = 1,000,000:
      // - rawVolumeRatio = 0.078 (< 0.08 sanity floor)
      // - pace volumeRatio = 0.078 / 0.0512 = 1.523 (>= 1.5 BREAKOUT_RATIO)
      // - LTP = 102 > TC = 101 with 15m candle close = 102 > TC
      // - Opening range high = 101 (LTP 102 > OR high)
      const stock: MarketStockData = {
        symbol: 'ISOLATION_TEST',
        market: 'NSE',
        sector: 'Energy',
        open: 100,
        high: 103,
        low: 99,
        close: 101, // P = 101, BC = 101, TC = 101
        ltp: 102,
        volume: 78000,
        avgVolume: 1000000,
        marketCap: 500000,
        rangeProvenance: 'INTRADAY_TODAY_BAR',
        candle15m: { open: 100, high: 103, low: 99, close: 102, volume: 5000 },
        openingCandle15m: { open: 100, high: 101, low: 99, close: 100.5, volume: 5000 },
      };

      const res = SignalService.getSignals(stock);

      // Verify computed volume ratios match our boundary test conditions
      assert.strictEqual(res.rawVolumeRatio, 0.078);
      assert.ok(res.volumeRatio >= 1.5);

      // 1. Classical CPR Breakout path:
      // Confirmed by pace volumeRatio >= 1.5 and 15m close > TC.
      // Unconstrained by the 0.08 floor because that floor is scoped strictly to ORB.
      assert.strictEqual(
        res.signals.includes('BREAKOUT'),
        true,
        'CPR BREAKOUT should be confirmed when pace volume is sufficient'
      );

      // 2. ORB path:
      // Receives rawVolumeRatio = 0.078 < 0.08.
      // isOrbBreakout rejects the setup on the 0.08 raw volume sanity floor.
      assert.strictEqual(
        res.signals.includes('ORB_LONG'),
        false,
        'ORB_LONG must be rejected when rawVolumeRatio < 0.08 sanity floor'
      );
    }
  );

  await t.test(
    'Both CPR BREAKOUT and ORB_LONG confirm when raw volume ratio >= 0.08 and pace ratio >= 1.5',
    () => {
      process.env.FEATURE_PACE_VOLUME = 'true';
      installMockDate();

      // With volume = 85,000 and avgVolume = 1,000,000:
      // - rawVolumeRatio = 0.085 (>= 0.08 floor)
      // - pace volumeRatio = 0.085 / 0.0512 = 1.66 (>= 1.5 BREAKOUT_RATIO)
      const stock: MarketStockData = {
        symbol: 'DUAL_CONFIRM_TEST',
        market: 'NSE',
        sector: 'Energy',
        open: 100,
        high: 103,
        low: 99,
        close: 101,
        ltp: 102,
        volume: 85000,
        avgVolume: 1000000,
        marketCap: 500000,
        rangeProvenance: 'INTRADAY_TODAY_BAR',
        candle15m: { open: 100, high: 103, low: 99, close: 102, volume: 5000 },
        openingCandle15m: { open: 100, high: 101, low: 99, close: 100.5, volume: 5000 },
      };

      const res = SignalService.getSignals(stock);

      assert.strictEqual(res.rawVolumeRatio, 0.085);
      assert.ok(res.volumeRatio >= 1.5);

      // Both CPR breakout and ORB breakout are confirmed
      assert.strictEqual(res.signals.includes('BREAKOUT'), true);
      assert.strictEqual(res.signals.includes('ORB_LONG'), true);
    }
  );
});
