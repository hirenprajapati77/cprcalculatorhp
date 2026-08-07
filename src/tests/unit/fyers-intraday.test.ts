import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStockIntradayMetricsFromFyersCandles } from '../../services/overnight/fyers-intraday.util';

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
