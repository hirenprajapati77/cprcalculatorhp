import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStockIntradayMetricsFromFyersCandles,
  parseFyers15mVwapAndCandle,
} from '../../services/overnight/fyers-intraday.util';

test('parseStockIntradayMetricsFromFyersCandles computes VWAP from 5m candles', () => {
  // 09:15 IST = 03:45 UTC on a fixed day
  const base = Date.UTC(2026, 7, 6, 3, 45, 0) / 1000;
  const candles: [number, number, number, number, number, number][] = [
    [base, 100, 101, 99, 100.5, 1000],
    [base + 300, 100.5, 102, 100, 101, 2000],
  ];
  const asOf = new Date(Date.UTC(2026, 7, 6, 4, 0, 0));
  const m = parseStockIntradayMetricsFromFyersCandles(candles, asOf);
  assert.equal(m.hasIntraday, true);
  assert.ok(m.vwap != null && m.vwap > 0);
  assert.equal(m.intradayVolume, 3000);
});

test('parseStockIntradayMetricsFromFyersCandles returns empty for no candles', () => {
  const m = parseStockIntradayMetricsFromFyersCandles([], new Date());
  assert.equal(m.hasIntraday, false);
  assert.equal(m.vwap, null);
});

test('parseStockIntradayMetricsFromFyersCandles handles zero-volume fallback correctly', () => {
  const base = Date.UTC(2026, 7, 6, 3, 45, 0) / 1000;
  const candles: [number, number, number, number, number, number][] = [
    [base, 100, 101, 99, 100, 0],
    [base + 300, 100.5, 102, 100, 101, 0],
  ];
  const asOf = new Date(Date.UTC(2026, 7, 6, 4, 0, 0));
  const m = parseStockIntradayMetricsFromFyersCandles(candles, asOf);
  assert.equal(m.hasIntraday, true);
  assert.equal(m.vwap, 100.5); // Average of close prices (100 + 101) / 2
  assert.equal(m.intradayVolume, 0); // Must be 0, not candle count
});

test('parseFyers15mVwapAndCandle computes session VWAP and last candle', () => {
  const t0 = Math.floor(Date.UTC(2026, 7, 10, 3, 45) / 1000);
  const candles: [number, number, number, number, number, number][] = [
    [t0, 210, 212, 209, 211, 1000],
    [t0 + 900, 211, 214, 210, 213, 2000],
    [t0 + 1800, 213, 216, 212, 215, 3000],
  ];
  const asOf = new Date(Date.UTC(2026, 7, 10, 5, 0));
  const m = parseFyers15mVwapAndCandle(candles, asOf);
  assert.ok(m.vwap != null && Math.abs(m.vwap - 213.05555555555557) < 1e-9);
  assert.ok(m.candle15m);
  assert.equal(m.candle15m!.close, 215);
  assert.equal(m.candle15m!.high, 216);
});

test('parseFyers15mVwapAndCandle returns nulls for empty input', () => {
  const m = parseFyers15mVwapAndCandle([], new Date());
  assert.equal(m.vwap, null);
  assert.equal(m.candle15m, null);
});
