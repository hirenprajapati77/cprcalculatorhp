import { describe, it } from 'node:test';
import assert from 'node:assert';
import { alignedYahooSeriesLength } from '@/lib/yahoo-quote';
import { parseIndexIntradayMetricsFromChart } from '@/services/overnight/index-intraday.util';
import { parseStockIntradayMetricsFromChart } from '@/services/overnight/stock-intraday.util';

describe('alignedYahooSeriesLength', () => {
  it('returns 0 when required series are missing', () => {
    assert.strictEqual(alignedYahooSeriesLength([1, 2], { high: [1, 2] }), 0);
  });

  it('truncates to the shortest REQUIRED series only (non-required like volume do not shrink length)', () => {
    // low has 3 items (shortest required series) -> minLen = 3
    // volume has 2 items but is NOT required -> should NOT shrink minLen
    assert.strictEqual(
      alignedYahooSeriesLength(
        [1, 2, 3, 4],
        {
          high: [1, 2, 3, 4],
          low: [1, 2, 3],
          close: [1, 2, 3, 4],
          volume: [10, 20],
        },
        ['high', 'low', 'close']
      ),
      3  // Correct: gated by 'low' (required, length 3) — NOT shrunk further by volume (non-required)
    );
  });

  it('returns 0 when a required series is shorter than any non-required series', () => {
    assert.strictEqual(
      alignedYahooSeriesLength(
        [1, 2, 3],
        {
          high: [1, 2, 3],
          low: [1],        // required, length 1
          close: [1, 2, 3],
          volume: [10, 20, 30], // non-required, longer — must not override required gate
        },
        ['high', 'low', 'close']
      ),
      1
    );
  });
});

describe('intraday parsers handle misaligned Yahoo payloads', () => {
  const asOf = new Date('2026-07-26T10:00:00.000Z');

  it('index parser returns empty when a required series is missing/empty', () => {
    const metrics = parseIndexIntradayMetricsFromChart(
      {
        chart: {
          result: [
            {
              timestamp: [1, 2, 3],
              indicators: {
                quote: [
                  {
                    high: [100, 101, 102],
                    low: [],
                    close: [100, 101, 102],
                    volume: [1000, 1000, 1000],
                  },
                ],
              },
            },
          ],
        },
      },
      asOf
    );
    assert.strictEqual(metrics.hasIntraday, false);
    assert.strictEqual(metrics.vwap, null);
  });

  it('stock parser truncates to aligned prefix instead of reading past series end', () => {
    const baseTs = Math.floor(asOf.getTime() / 1000) - 600;
    const metrics = parseStockIntradayMetricsFromChart(
      {
        chart: {
          result: [
            {
              timestamp: [baseTs, baseTs + 300, baseTs + 600],
              indicators: {
                quote: [
                  {
                    high: [102, 104],
                    low: [98, 100],
                    close: [100, 102],
                    // shorter volume — must truncate, not invent zeros for bar 3
                    volume: [1000],
                  },
                ],
              },
            },
          ],
        },
      },
      asOf
    );
    assert.strictEqual(metrics.hasIntraday, true);
    assert.ok(metrics.vwap !== null);
    // Only the first aligned bar (volume length 1) is used
    assert.strictEqual(metrics.intradayVolume, 1000);
  });
});
