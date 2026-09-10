import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateEMASeries, getLastTwoEMA, detectEmaCross } from '../../lib/ema';

describe('EMA Calculation Utilities (Tier 1 coverage)', () => {
  describe('calculateEMASeries', () => {
    it('returns empty array when prices length < period', () => {
      assert.deepEqual(calculateEMASeries([10, 20, 30], 5), []);
    });

    it('calculates correct EMA series for standard prices', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16];
      const series = calculateEMASeries(prices, 3);
      assert.equal(series.length, prices.length - 3 + 1);
      // First value is SMA(10, 11, 12) = 11
      assert.equal(series[0], 11);
    });
  });

  describe('getLastTwoEMA', () => {
    it('returns null if history has fewer than period + 1 candles', () => {
      const candles = [{ close: 10 }, { close: 12 }, { close: 14 }];
      assert.equal(getLastTwoEMA(candles, 5), null);
    });

    it('returns prev and current EMA when history is sufficient', () => {
      const candles = Array.from({ length: 15 }, (_, i) => ({ close: 100 + i }));
      const result = getLastTwoEMA(candles, 9);
      assert.ok(result !== null);
      assert.ok(result.current > result.prev);
    });
  });

  describe('detectEmaCross', () => {
    it('returns null when history has fewer than 22 candles', () => {
      const shortHistory = Array.from({ length: 15 }, (_, i) => ({ close: 100 + i }));
      assert.equal(detectEmaCross(shortHistory), null);
    });

    it('detects BULLISH cross when EMA9 crosses above EMA21', () => {
      const prices = [...Array(20).fill(100), 98, 150];
      const candles = prices.map((close) => ({ close }));
      const result = detectEmaCross(candles);
      assert.ok(result !== null);
      assert.equal(result.cross, 'BULLISH');
      assert.equal(result.isBullishAlignment, true);
    });

    it('detects BEARISH cross when EMA9 crosses below EMA21', () => {
      const prices = [...Array(20).fill(100), 102, 50];
      const candles = prices.map((close) => ({ close }));
      const result = detectEmaCross(candles);
      assert.ok(result !== null);
      assert.equal(result.cross, 'BEARISH');
      assert.equal(result.isBullishAlignment, false);
    });

    it('returns NONE when no cross occurred (steady uptrend)', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const candles = prices.map((close) => ({ close }));
      const result = detectEmaCross(candles);
      assert.ok(result !== null);
      assert.equal(result.cross, 'NONE');
      assert.equal(result.isBullishAlignment, true);
    });
  });
});
