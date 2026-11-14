import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BtstRankingService } from '@/services/overnight/btst-ranking.service';
import { MarketService } from '@/services/market.service';
import { evaluateStockBtstDay, type StockBtstDayContext } from '@/services/backtest/stock-btst-backtest.helper';
import { env } from '@/config/env';
import { CacheService } from '@/services/cache.service';
import { FyersAuthService } from '@/services/fyers-auth.service';
import type { YahooFinanceChartResponse } from '@/services/overnight/index-intraday.util';

describe('Volume Sourcing & Fallback Scenarios (Review Follow-up Section F)', () => {
  it('(1) Healthy Fyers day: max(stockVolume, intradayVolume) raises VDU score when intraday volume is larger', () => {
    // Intended Behaviour:
    // When live feed provides stock.volume = 150k and intraday 5m bar sum is 210k with avgVolume = 100k:
    // - Without higher intraday volume: ratio = 150k / 100k = 1.5 < SPIKE_RATIO (2.0) -> VDU score = 0 pts
    // - With higher intraday volume: ratio = 210k / 100k = 2.1 >= SPIKE_RATIO (2.0) -> VDU score = 25 pts
    // resolveSessionVolume selects max(150k, 210k) = 210k, raising the VDU score from 0 to 25 points (+25 pts).

    const baseInputs = {
      volume: 150_000,
      avgVolume: 100_000,
      open: 100,
      close: 105,
      high: 106,
      low: 99,
      tomorrowCprNarrow: true,
      tomorrowBc: 101,
      tomorrowTc: 103,
      todayBc: 99,
      todayTc: 101,
      vwap: 103,
      last15mHigh: 104,
      rsi14: 60,
      emaCross: { cross: 'BULLISH' as const, isBullishAlignment: true },
      hasConfirmationCandles: true,
    };

    const detailsWithoutIntraday = BtstRankingService.calculateScoreDetails({
      ...baseInputs,
      intradayVolume: 120_000,
    });

    const detailsWithIntraday = BtstRankingService.calculateScoreDetails({
      ...baseInputs,
      intradayVolume: 210_000,
    });

    assert.ok(detailsWithoutIntraday.breakdown !== null);
    assert.ok(detailsWithIntraday.breakdown !== null);
    assert.equal(detailsWithoutIntraday.breakdown!.vdu, 0, 'ratio 1.5 is below 2.0x spike threshold -> 0 pts');
    assert.equal(detailsWithIntraday.breakdown!.vdu, 25, 'ratio 2.1 meets 2.0x spike threshold -> 25 pts');
    assert.equal(
      detailsWithIntraday.score,
      detailsWithoutIntraday.score! + 25,
      'Total BTST score must be exactly 25 points higher when intradayVolume crosses the SPIKE_RATIO (2.0x) threshold'
    );
  });

  it('(2) Mixed state: live volume with frozen O/H/L when 15m aggregation fails', async () => {
    const originalMode = env.MARKET_DATA_MODE;
    const originalFetch = global.fetch;
    const originalCacheGet = CacheService.get;
    const originalCacheSet = CacheService.set;
    const originalGetAccessToken = FyersAuthService.getAccessToken;
    const originalGetCredentials = FyersAuthService.getCredentials;

    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';
    CacheService.get = async () => null;
    CacheService.set = async () => {};
    FyersAuthService.getAccessToken = async () => 'fyers_test_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    const t1 = Date.UTC(2026, 10, 12) / 1000;
    const t2 = Date.UTC(2026, 10, 13) / 1000;

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      // Force Yahoo fallback by returning 403 on Fyers
      if (url.includes('api-t1.fyers.in')) {
        return new Response(JSON.stringify({ s: 'error', code: 403 }), { status: 403 });
      }
      if (url.includes('interval=1d')) {
        return new Response(JSON.stringify({
          chart: {
            result: [{
              meta: { regularMarketPrice: 205 },
              timestamp: [t1, t2],
              indicators: {
                quote: [{
                  open: [195, 200],
                  high: [205, 210],
                  low: [190, 198],
                  close: [200, 205],
                  volume: [50000, 95000],
                }],
              },
            }],
          },
        }));
      }
      if (url.includes('interval=15m')) {
        // 15m fetch fails (e.g. rate limit 429)
        return new Response('Rate limited', { status: 429 });
      }
      return new Response('Not found', { status: 404 });
    };

    try {
      const data = await MarketService.getStockData('INFY', 'NSE');
      assert.ok(data);
      // In mixed state, sessionAggregated is false
      assert.strictEqual(data!.sessionAggregated, false);
      // O/H/L remain frozen at daily candle snapshot values
      assert.strictEqual(data!.open, 200, 'open stays frozen at snapshot open');
      assert.strictEqual(data!.high, 210, 'high stays frozen at snapshot high');
      assert.strictEqual(data!.low, 198, 'low stays frozen at snapshot low');
      assert.strictEqual(data!.volume, 95000, 'volume reflects daily candle snapshot volume');
    } finally {
      MarketService.clearFyersPermissionBlock();
      (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = originalMode;
      global.fetch = originalFetch;
      CacheService.get = originalCacheGet;
      CacheService.set = originalCacheSet;
      FyersAuthService.getAccessToken = originalGetAccessToken;
      FyersAuthService.getCredentials = originalGetCredentials;
    }
  });

  it('(3) Yahoo range=1d returning prior-session bars: verify current bar-date behavior', async () => {
    // Finding verification:
    // When Yahoo returns 15m bars whose timestamps belong to the prior trading session
    // (e.g. before market open or on holidays), getStockData does not compare 15m bar
    // timestamps against today's date. As a result, prior-session extremes are treated as today's session.
    const originalMode = env.MARKET_DATA_MODE;
    const originalFetch = global.fetch;
    const originalCacheGet = CacheService.get;
    const originalCacheSet = CacheService.set;
    const originalGetAccessToken = FyersAuthService.getAccessToken;
    const originalGetCredentials = FyersAuthService.getCredentials;

    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';
    CacheService.get = async () => null;
    CacheService.set = async () => {};
    FyersAuthService.getAccessToken = async () => 'fyers_test_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    // Bar timestamps from yesterday (e.g., Nov 10 when today is Nov 11)
    const yesterdayTimestamp = Math.floor(Date.now() / 1000) - 86400;

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('api-t1.fyers.in')) {
        return new Response(JSON.stringify({ s: 'error', code: 403 }), { status: 403 });
      }
      if (url.includes('interval=1d')) {
        return new Response(JSON.stringify({
          chart: {
            result: [{
              meta: { regularMarketPrice: 500 },
              timestamp: [yesterdayTimestamp],
              indicators: {
                quote: [{
                  open: [490],
                  high: [510],
                  low: [485],
                  close: [500],
                  volume: [100000],
                }],
              },
            }],
          },
        }));
      }
      if (url.includes('interval=15m')) {
        // Yahoo returns prior-session 15m bars with yesterday's timestamps
        return new Response(JSON.stringify({
          chart: {
            result: [{
              meta: { regularMarketPrice: 500 },
              timestamp: [yesterdayTimestamp, yesterdayTimestamp + 900],
              indicators: {
                quote: [{
                  open: [490, 495],
                  high: [495, 510],
                  low: [485, 492],
                  close: [495, 500],
                  volume: [40000, 60000],
                }],
              },
            }],
          },
        }));
      }
      return new Response('Not found', { status: 404 });
    };

    try {
      const data = await MarketService.getStockData('RELIANCE', 'NSE');
      assert.ok(data);
      // Documenting verified finding:
      // In the current implementation, getStockData aggregates any valid OHLC returned by range=1d
      // without checking if the bar timestamps match the current calendar date.
      // Therefore sessionAggregated is true.
      assert.strictEqual(
        data!.sessionAggregated,
        true,
        'Finding: 15m session aggregation loop currently lacks bar-date timestamp guard and aggregates prior-session bars'
      );
    } finally {
      MarketService.clearFyersPermissionBlock();
      (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = originalMode;
      global.fetch = originalFetch;
      CacheService.get = originalCacheGet;
      CacheService.set = originalCacheSet;
      FyersAuthService.getAccessToken = originalGetAccessToken;
      FyersAuthService.getCredentials = originalGetCredentials;
    }
  });

  it('(4) BTST backtest helper score changes when intradayVolume > daily volume', () => {
    const yesterday = { date: '2026-11-12', open: 99, high: 101, low: 98, close: 100, volume: 100000 };
    const today = { date: '2026-11-13', open: 100.5, high: 102.5, low: 100, close: 102, volume: 150000 };

    // Build 20 completed daily bars before today
    const historyForAtr = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      open: 99,
      high: 101,
      low: 97,
      close: 100,
      volume: 100000,
    }));

    const asOfTime = new Date('2026-11-13T09:50:00.000Z'); // 15:20 IST
    const t0 = Math.floor(new Date('2026-11-13T03:45:00.000Z').getTime() / 1000); // 09:15 IST

    // Case A: Intraday 5m volume sum = 110,000 <= daily volume (150,000)
    // sessionVolume resolves to 150,000 (1.5x avgVolume, below 2.0x SPIKE_RATIO -> 0 VDU pts)
    const chartJsonA: YahooFinanceChartResponse = {
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 102,
            previousClose: 100,
          },
          timestamp: [t0, t0 + 300],
          indicators: {
            quote: [{
              open: [100.5, 101],
              high: [101, 102],
              low: [100, 100.5],
              close: [101, 102],
              volume: [50000, 60000], // sum = 110,000
            }],
          },
        }],
      },
    };

    // Case B: Intraday 5m volume sum = 220,000 > daily volume (150,000)
    // sessionVolume resolves to 220,000 (2.2x avgVolume >= 2.0x SPIKE_RATIO -> 25 VDU pts)
    const chartJsonB: YahooFinanceChartResponse = {
      chart: {
        result: [{
          meta: {
            regularMarketPrice: 102,
            previousClose: 100,
          },
          timestamp: [t0, t0 + 300],
          indicators: {
            quote: [{
              open: [100.5, 101],
              high: [101, 102],
              low: [100, 100.5],
              close: [101, 102],
              volume: [110000, 110000], // sum = 220,000
            }],
          },
        }],
      },
    };

    const ctxA: StockBtstDayContext = {
      symbol: 'TESTSYM',
      yesterday,
      today,
      historyForAtr,
      chartJson: chartJsonA,
      asOfTime,
      regime: { isBull: true, regimeScore: 80, regime: 'BULL', reason: 'Nifty above 200 SMA' } as any,
      directionFilter: 'LONG',
    };

    const ctxB: StockBtstDayContext = {
      ...ctxA,
      chartJson: chartJsonB,
    };

    const resA = evaluateStockBtstDay(ctxA);
    const resB = evaluateStockBtstDay(ctxB);

    assert.ok(resA.score !== null, 'Case A produces valid score');
    assert.ok(resB.score !== null, 'Case B produces valid score');
    assert.equal(
      resB.score!,
      resA.score! + 25,
      `Backtest helper score with higher intraday volume (${resB.score}) must exceed base score (${resA.score}) by 25 VDU points`
    );
  });
});
