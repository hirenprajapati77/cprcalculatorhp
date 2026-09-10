import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStockIntradayMetricsFromChart,
  toYahooNseSymbol,
} from '@/services/overnight/stock-intraday.util';

describe('stock-intraday.util (Tier 2)', () => {
  it('toYahooNseSymbol handles index and stock symbols', () => {
    assert.equal(toYahooNseSymbol('^NSEI'), '^NSEI');
    assert.equal(toYahooNseSymbol('RELIANCE.NS'), 'RELIANCE.NS');
    assert.equal(toYahooNseSymbol('INFY'), 'INFY.NS');
  });

  it('returns empty metrics when chartJson is missing or malformed', () => {
    const asOf = new Date('2026-09-08T15:30:00.000Z');
    assert.deepEqual(parseStockIntradayMetricsFromChart(null, asOf), {
      vwap: null,
      intradayVolume: null,
      last15mHigh: null,
      last15mLow: null,
      hasIntraday: false,
    });
    assert.deepEqual(parseStockIntradayMetricsFromChart({} as any, asOf), {
      vwap: null,
      intradayVolume: null,
      last15mHigh: null,
      last15mLow: null,
      hasIntraday: false,
    });
  });

  it('handles sumVol === 0 with unweighted close average fallback', () => {
    // 15:20 IST = 09:50 UTC = timestamp 1788861000
    const asOf = new Date('2026-09-08T10:00:00.000Z');
    const chart = {
      chart: {
        result: [
          {
            timestamp: [1788860000, 1788860300],
            indicators: {
              quote: [
                {
                  high: [102, 104],
                  low: [98, 100],
                  close: [100, 102],
                  volume: [0, 0], // zero volume
                },
              ],
            },
          },
        ],
      },
    };

    const metrics = parseStockIntradayMetricsFromChart(chart as any, asOf);
    assert.equal(metrics.hasIntraday, true);
    assert.equal(metrics.vwap, 101); // (100 + 102) / 2
    assert.equal(metrics.intradayVolume, 2); // count of bars
  });

  it('handles timestamps in future relative to asOfTime', () => {
    const asOf = new Date(1788860000 * 1000);
    const chart = {
      chart: {
        result: [
          {
            timestamp: [1788860000, 1788870000], // second is in the future
            indicators: {
              quote: [
                {
                  high: [102, 108],
                  low: [98, 105],
                  close: [100, 107],
                  volume: [1000, 5000],
                },
              ],
            },
          },
        ],
      },
    };

    const metrics = parseStockIntradayMetricsFromChart(chart as any, asOf);
    assert.equal(metrics.hasIntraday, true);
    assert.equal(metrics.intradayVolume, 1000);
    assert.equal(metrics.vwap, 100); // (102 + 98 + 100) / 3 = 100
  });
});
