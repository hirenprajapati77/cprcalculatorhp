import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EarningsPopulatorService } from '../../services/earnings-populator.service';
import { MarketService } from '../../services/market.service';
import YahooFinance from 'yahoo-finance2';

describe('EarningsPopulatorService Yahoo Finance timeout resilience', () => {
  it('handles hung Yahoo Finance request gracefully via per-symbol timeout', async () => {
    const origGetUniverse = MarketService.getUniverse;
    const origFetch = globalThis.fetch;
    const origQuoteSummary = YahooFinance.prototype.quoteSummary;

    MarketService.getUniverse = () => [
      { symbol: 'HUNG_STOCK' },
      { symbol: 'FAST_STOCK' },
    ] as any;

    // Simulate NSE failure so all symbols go to Yahoo fallback
    globalThis.fetch = async () => {
      throw new Error('NSE offline');
    };

    let hungCalled = false;
    let fastCalled = false;

    YahooFinance.prototype.quoteSummary = async function (symbol: string, _options?: any) {
      if (symbol === 'HUNG_STOCK.NS') {
        hungCalled = true;
        // Hung promise that never resolves
        return new Promise(() => {});
      }
      if (symbol === 'FAST_STOCK.NS') {
        fastCalled = true;
        return {
          calendarEvents: {
            earnings: {
              earningsDate: ['2026-09-15'],
              isEarningsDateEstimate: false,
            },
          },
        } as any;
      }
      return {} as any;
    };

    try {
      const startTime = Date.now();
      // Dry run with a 50ms per-symbol timeout
      const result = await EarningsPopulatorService.populate(true, 50);
      const elapsed = Date.now() - startTime;

      assert.equal(hungCalled, true, 'HUNG_STOCK should have been called');
      assert.equal(fastCalled, true, 'FAST_STOCK should have been called');
      assert.equal(result.yahooCount, 1, 'FAST_STOCK should have succeeded');
      // Should complete quickly around 50-500ms, not hang
      assert.ok(elapsed < 2000, `Execution should complete quickly; took ${elapsed}ms`);
    } finally {
      MarketService.getUniverse = origGetUniverse;
      globalThis.fetch = origFetch;
      YahooFinance.prototype.quoteSummary = origQuoteSummary;
    }
  });

  it('processes normal Yahoo Finance responses correctly within timeout', async () => {
    const origGetUniverse = MarketService.getUniverse;
    const origFetch = globalThis.fetch;
    const origQuoteSummary = YahooFinance.prototype.quoteSummary;

    MarketService.getUniverse = () => [
      { symbol: 'STOCK_A' },
      { symbol: 'STOCK_B' },
    ] as any;

    globalThis.fetch = async () => {
      throw new Error('NSE offline');
    };

    YahooFinance.prototype.quoteSummary = async function (_symbol: string, _options?: any) {
      return {
        calendarEvents: {
          earnings: {
            earningsDate: ['2026-09-20'],
            isEarningsDateEstimate: true,
          },
        },
      } as any;
    };

    try {
      const result = await EarningsPopulatorService.populate(true, 200);
      assert.equal(result.yahooCount, 2, 'Both stocks should be populated from Yahoo');
    } finally {
      MarketService.getUniverse = origGetUniverse;
      globalThis.fetch = origFetch;
      YahooFinance.prototype.quoteSummary = origQuoteSummary;
    }
  });
});
