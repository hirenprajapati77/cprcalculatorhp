import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseIndexIntradayMetricsFromChart, YahooFinanceChartResponse } from '@/services/overnight/index-intraday.util';

describe('index-intraday.util', () => {
  describe('parseIndexIntradayMetricsFromChart', () => {
    it('should return empty metrics for missing or invalid chart data', () => {
      const asOfTime = new Date('2026-07-26T10:00:00.000Z'); // 15:30 IST
      
      assert.deepStrictEqual(parseIndexIntradayMetricsFromChart(null, asOfTime), {
        vwap: null,
        hasIntraday: false,
        last15mHigh: null,
        last15mLow: null,
      });

      assert.deepStrictEqual(parseIndexIntradayMetricsFromChart({} as YahooFinanceChartResponse, asOfTime), {
        vwap: null,
        hasIntraday: false,
        last15mHigh: null,
        last15mLow: null,
      });
    });

    it('should correctly calculate last15mHigh and last15mLow during the closing liquidity window', () => {
      const date = new Date('2026-07-26T09:45:00.000Z');
      const baseTs = Math.floor(date.getTime() / 1000);
      
      const timestamps = [
        baseTs - 600, // 15:05 IST
        baseTs - 300, // 15:10 IST
        baseTs,       // 15:15 IST (in window)
        baseTs + 300, // 15:20 IST (in window)
      ];

      const chartJson: YahooFinanceChartResponse = {
        chart: {
          result: [{
            timestamp: timestamps,
            indicators: {
              quote: [{
                open: [100, 105, 110, 115],
                high: [102, 106, 112, 120],
                low: [98, 104, 108, 110],
                close: [101, 105, 111, 115],
                volume: [1000, 1000, 1000, 1000],
              }]
            }
          }]
        }
      };

      const asOfTime = new Date(baseTs * 1000 + 600000); // baseTs + 10 mins = 15:25 IST
      
      const metrics = parseIndexIntradayMetricsFromChart(chartJson, asOfTime);
      
      assert.strictEqual(metrics.hasIntraday, true);
      assert.strictEqual(metrics.last15mHigh, 120);
      assert.strictEqual(metrics.last15mLow, 108);
      assert.notStrictEqual(metrics.vwap, null);
    });
    
    it('should fall back to unweighted average if volume is 0', () => {
      const date = new Date('2026-07-26T09:45:00.000Z');
      const baseTs = Math.floor(date.getTime() / 1000);
      
      const timestamps = [baseTs];

      const chartJson: YahooFinanceChartResponse = {
        chart: {
          result: [{
            timestamp: timestamps,
            indicators: {
              quote: [{
                open: [100],
                high: [102],
                low: [98],
                close: [100],
                volume: [0],
              }]
            }
          }]
        }
      };

      const asOfTime = new Date(baseTs * 1000 + 300000);
      
      const metrics = parseIndexIntradayMetricsFromChart(chartJson, asOfTime);
      
      assert.strictEqual(metrics.hasIntraday, true);
      assert.strictEqual(metrics.vwap, 100);
      assert.strictEqual(metrics.last15mHigh, 102);
      assert.strictEqual(metrics.last15mLow, 98);
    });
  });
});
