import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidOhlcvGeometry } from '../../services/market-tools/historical-window-validation';
import { buildVpaInputs } from '../../services/vpa/vpa.math';
import { HistoricalProvider, type OHLC } from '../../services/backtest/historical.provider';

describe('ISSUE-003: Canonical OHLCV Validation at Calculation Boundaries', () => {
  describe('isValidOhlcvGeometry - Core Invariants', () => {
    it('accepts standard valid bullish and bearish candles', () => {
      // Bullish
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 105, volume: 10000, prevClose: 99 }),
        true
      );
      // Bearish
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 105, high: 110, low: 95, close: 100, volume: 15000, prevClose: 106 }),
        true
      );
    });

    it('preserves valid doji candles (open === close)', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 108, low: 92, close: 100, volume: 5000, prevClose: 101 }),
        true
      );
    });

    it('preserves valid flat sessions (open === high === low === close)', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 50, high: 50, low: 50, close: 50, volume: 100, prevClose: 50 }),
        true
      );
    });

    it('handles optional fields (volume, prevClose) as null or undefined', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 105, low: 95, close: 102 }),
        true
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 105, low: 95, close: 102, volume: null, prevClose: null }),
        true
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 105, low: 95, close: 102, volume: BigInt(50000) }),
        true
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 105, low: 95, close: 102, volume: 0 }),
        true
      );
    });

    it('rejects inverted geometry (high < low)', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 90, low: 110, close: 100 }),
        false
      );
    });

    it('rejects candles where open or close exceeds high', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 115, high: 110, low: 95, close: 105 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 112 }),
        false
      );
    });

    it('rejects candles where open or close drops below low', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 90, high: 110, low: 95, close: 105 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 92 }),
        false
      );
    });

    it('rejects zero or negative prices', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 0, high: 110, low: 0, close: 105 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: -5, close: 105 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: -1 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: -10, low: -20, close: -15 }),
        false
      );
    });

    it('rejects negative volume or non-positive prevClose', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 105, volume: -1 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 105, prevClose: 0 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 105, prevClose: -10 }),
        false
      );
    });

    it('rejects non-finite values (NaN, Infinity)', () => {
      assert.strictEqual(
        isValidOhlcvGeometry({ open: NaN, high: 110, low: 95, close: 105 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: Infinity, low: 95, close: 105 }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 105, volume: NaN }),
        false
      );
      assert.strictEqual(
        isValidOhlcvGeometry({ open: 100, high: 110, low: 95, close: 105, prevClose: Infinity }),
        false
      );
    });
  });

  describe('buildVpaInputs - Realtime & Boundary Hardening', () => {
    const validCpr = { bc: 100, tc: 102 };

    it('constructs valid VPA inputs for compliant stock candle', () => {
      const result = buildVpaInputs('LONG', {
        open: 101,
        high: 106,
        low: 99,
        ltp: 105,
        volume: 50000,
        avgVolume: 40000,
      }, validCpr);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.open, 101);
      assert.strictEqual(result?.high, 106);
      assert.strictEqual(result?.low, 99);
      assert.strictEqual(result?.close, 105);
      assert.strictEqual(result?.volume, 50000);
      assert.strictEqual(result?.avgVolume, 40000);
    });

    it('bounds intra-bar LTP extension to effectiveHigh/effectiveLow', () => {
      const result = buildVpaInputs('LONG', {
        open: 100,
        high: 105,
        low: 95,
        ltp: 107, // tick slightly above recorded high
        volume: 50000,
        avgVolume: 40000,
      }, validCpr);

      assert.notStrictEqual(result, null);
      assert.strictEqual(result?.high, 107);
      assert.strictEqual(result?.close, 107);
    });

    it('rejects physically impossible candle (high < low)', () => {
      const result = buildVpaInputs('LONG', {
        open: 100,
        high: 90,
        low: 110,
        ltp: 100,
        volume: 50000,
        avgVolume: 40000,
      }, validCpr);

      assert.strictEqual(result, null);
    });

    it('rejects zero or negative open/high/low/close', () => {
      assert.strictEqual(
        buildVpaInputs('LONG', { open: 0, high: 105, low: 95, ltp: 100, volume: 50000, avgVolume: 40000 }, validCpr),
        null
      );
      assert.strictEqual(
        buildVpaInputs('LONG', { open: 100, high: -5, low: -10, ltp: -6, volume: 50000, avgVolume: 40000 }, validCpr),
        null
      );
      assert.strictEqual(
        buildVpaInputs('LONG', { open: 100, high: 105, low: 95, ltp: 0, volume: 50000, avgVolume: 40000 }, validCpr),
        null
      );
    });

    it('rejects negative volume or non-positive/non-finite avgVolume', () => {
      assert.strictEqual(
        buildVpaInputs('LONG', { open: 100, high: 105, low: 95, ltp: 102, volume: -1, avgVolume: 40000 }, validCpr),
        null
      );
      assert.strictEqual(
        buildVpaInputs('LONG', { open: 100, high: 105, low: 95, ltp: 102, volume: 50000, avgVolume: -10 }, validCpr),
        null
      );
      assert.strictEqual(
        buildVpaInputs('LONG', { open: 100, high: 105, low: 95, ltp: 102, volume: 50000, avgVolume: NaN }, validCpr),
        null
      );
    });

    it('rejects non-finite CPR values', () => {
      const result = buildVpaInputs('LONG', {
        open: 100,
        high: 105,
        low: 95,
        ltp: 102,
        volume: 50000,
        avgVolume: 40000,
      }, { bc: NaN, tc: 102 });

      assert.strictEqual(result, null);
    });
  });

  describe('HistoricalProvider - Boundary Validation & Mock Generation', () => {
    it('deterministic mock produces geometrically valid candles', async () => {
      const start = new Date('2026-01-05');
      const end = new Date('2026-01-16');
      const history = await HistoricalProvider.getHistory('RELIANCE', start, end);

      assert.ok(history.length > 0);
      for (const candle of history) {
        assert.strictEqual(isValidOhlcvGeometry(candle), true);
        assert.strictEqual(typeof candle.date, 'string');
      }
    });

    it('filters out corrupted candles with open > high or negative price', () => {
      const mockRaw: (OHLC | null)[] = [
        { date: '2026-01-05', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
        { date: '2026-01-06', open: 115, high: 110, low: 95, close: 105, volume: 1000 }, // open > high
        { date: '2026-01-07', open: 100, high: 110, low: -5, close: 105, volume: 1000 }, // negative low
        { date: '2026-01-08', open: 0, high: 110, low: 95, close: 105, volume: 1000 },   // zero open
        { date: '2026-01-09', open: 105, high: 112, low: 102, close: 108, volume: 1200 }, // valid
      ];

      const filtered = mockRaw.filter(
        (c): c is OHLC => Boolean(c && typeof c.date === 'string' && c.date && isValidOhlcvGeometry(c))
      );

      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered[0].date, '2026-01-05');
      assert.strictEqual(filtered[1].date, '2026-01-09');
    });
  });
});
