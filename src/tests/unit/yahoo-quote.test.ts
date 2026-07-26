import { describe, it } from 'node:test';
import assert from 'node:assert';
import { alignedYahooSeriesLength } from '@/lib/yahoo-quote';
import { parseIndexIntradayMetricsFromChart } from '@/services/overnight/index-intraday.util';
import { parseStockIntradayMetricsFromChart } from '@/services/overnight/stock-intraday.util';

describe('alignedYahooSeriesLength', () => {
  it('returns 0 when required series are missing', () => {
    assert.strictEqual(alignedYahooSeriesLength([1, 2], { high: [1, 2] }), 0);
  });

  it('truncates to the shortest aligned series', () => {
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
      2
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
