import test from 'node:test';
import assert from 'node:assert';
import { MarketService, MarketStockData } from '../../services/market.service';
import { CacheService } from '../../services/cache.service';
import { FyersAuthService } from '../../services/fyers-auth.service';
import { env } from '../../config/env';

test('Market Service - 200 SMA Plumbing', async (t) => {

  await t.test('SMA Calculation Mathematical Correctness (>= 200 guard)', async () => {
    // Generate 200 closes from 1 to 200
    const mockCloses = Array.from({ length: 200 }, (_, i) => i + 1);
    
    // Create a mock fetch that returns these closes for the first symbol and <200 for the second
    const originalFetch = global.fetch;
    global.fetch = async (url: string | URL | globalThis.Request, _init?: RequestInit): Promise<Response> => {
      if (url.toString().includes('TEST1.NS')) {
        return new Response(JSON.stringify({
          chart: { result: [{ indicators: { quote: [{ close: mockCloses }] } }] }
        }));
      }
      if (url.toString().includes('TEST2.NS')) {
        return new Response(JSON.stringify({
          chart: { result: [{ indicators: { quote: [{ close: [1, 2, 3] }] } }] } // < 200
        }));
      }
      return new Response(JSON.stringify({}), { status: 404 });
    };

    // Override the universe logic briefly to test just our mock symbols
    const originalGetUniverse = MarketService.getUniverse;
    MarketService.getUniverse = () => [
      { symbol: 'TEST1', name: '', sector: '', marketCap: 0, isNifty50: false, isNifty200: false, isFnO: false },
      { symbol: 'TEST2', name: '', sector: '', marketCap: 0, isNifty50: false, isNifty200: false, isFnO: false }
    ];

    const cachedVals: Record<string, number> = {};
    const originalCacheSet = CacheService.set;
    CacheService.set = async (key: string, val: unknown) => {
      cachedVals[key] = val as number;
    };

    try {
      const result = await MarketService.cache200SMA('ALL');
      
      // TEST1 should succeed and equal exactly 100.5
      assert.strictEqual(cachedVals['sma200:TEST1'], 100.5);
      
      // TEST2 should be skipped because it has < 200 candles
      assert.strictEqual(cachedVals['sma200:TEST2'], undefined);
      
      assert.strictEqual(result.success, 1);
      assert.strictEqual(result.failed, 1);
    } finally {
      global.fetch = originalFetch;
      MarketService.getUniverse = originalGetUniverse;
      CacheService.set = originalCacheSet;
    }
  });

  await t.test('cache200SMA() Per-Symbol Isolation on 404', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url: string | URL | globalThis.Request, _init?: RequestInit): Promise<Response> => {
      if (url.toString().includes('FAIL.NS')) {
        return new Response(JSON.stringify({}), { status: 404 });
      }
      if (url.toString().includes('PASS.NS')) {
        return new Response(JSON.stringify({
          chart: { result: [{ indicators: { quote: [{ close: Array(200).fill(10) }] } }] }
        }));
      }
      return new Response('', { status: 500 });
    };

    const originalGetUniverse = MarketService.getUniverse;
    MarketService.getUniverse = () => [
      { symbol: 'FAIL', name: '', sector: '', marketCap: 0, isNifty50: false, isNifty200: false, isFnO: false },
      { symbol: 'PASS', name: '', sector: '', marketCap: 0, isNifty50: false, isNifty200: false, isFnO: false }
    ];

    let passCached = false;
    const originalCacheSet = CacheService.set;
    CacheService.set = async (key: string, _val: unknown) => {
      if (key === 'sma200:PASS') passCached = true;
    };

    try {
      const result = await MarketService.cache200SMA('ALL');
      assert.strictEqual(passCached, true, 'Valid symbol should be cached despite prior failure');
      assert.strictEqual(result.success, 1);
      assert.strictEqual(result.failed, 1);
    } finally {
      global.fetch = originalFetch;
      MarketService.getUniverse = originalGetUniverse;
      CacheService.set = originalCacheSet;
    }
  });

  await t.test('getStockData() Cache Miss Fallback', async () => {
    const originalCacheGet = CacheService.get;
    CacheService.get = async <T>(key: string): Promise<T | null> => {
      if (key.startsWith('stock_data_')) {
        return { symbol: 'TEST', ltp: 100 } as unknown as T; // Primary cache hit
      }
      if (key.startsWith('sma200:')) {
        return null; // Missing 200 SMA
      }
      return null;
    };

    try {
      const data = await MarketService.getStockData('TEST');
      assert.ok(data !== null);
      assert.strictEqual(data!.sma200, undefined, 'Missing sma200 should be strictly undefined');
    } finally {
      CacheService.get = originalCacheGet;
    }
  });

  await t.test('getStockData() Fyers Connected-only fallback after Yahoo 404', async () => {
    const originalMode = env.MARKET_DATA_MODE;
    const originalFetch = global.fetch;
    const originalCacheGet = CacheService.get;
    const originalCacheSet = CacheService.set;
    const originalGetAccessToken = FyersAuthService.getAccessToken;
    const originalGetCredentials = FyersAuthService.getCredentials;
    const originalClearToken = FyersAuthService.clearToken;

    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';
    CacheService.get = async () => null;
    let cached: MarketStockData | null = null;
    CacheService.set = async (_key: string, val: unknown) => {
      cached = val as MarketStockData;
    };
    FyersAuthService.getAccessToken = async () => 'fyers_test_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });
    FyersAuthService.clearToken = async () => {};

    // Build 110 synthetic daily candles so sma50Slope path is exercised
    const candles: Array<[number, number, number, number, number, number]> = [];
    const start = Date.UTC(2026, 0, 1) / 1000;
    for (let i = 0; i < 110; i++) {
      const px = 100 + i;
      candles.push([start + i * 86400, px, px + 1, px - 1, px, 1000 + i]);
    }

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('query1.finance.yahoo.com')) {
        return new Response(JSON.stringify({ chart: { result: null, error: { code: 'Not Found' } } }), {
          status: 404,
        });
      }
      if (url.includes('api-t1.fyers.in/data/history') && url.includes('NSE%3ALTM-EQ')) {
        return new Response(JSON.stringify({ s: 'ok', code: 200, message: '', candles }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    };

    try {
      const data = await MarketService.getStockData('LTM', 'NSE');
      assert.ok(data, 'Fyers fallback should return stock data when Connected');
      assert.strictEqual(data!.symbol, 'LTM');
      assert.ok(data!.history && data!.history.length > 0);
      assert.ok(data!.history!.length <= 22, 'history should be truncated to ~22 for CPR/ATR');
      assert.strictEqual(data!.ltp, data!.close);
      assert.ok(typeof data!.sma50Slope === 'number');
      // BUG-3: previousClose must be prior session, not last.close (== ltp)
      assert.ok(
        data!.previousClose != null && data!.previousClose !== data!.ltp,
        'Fyers previousClose must not collapse to ltp (extension gate needs real day-return)'
      );
      const hist = data!.history!;
      assert.strictEqual(data!.previousClose, hist[hist.length - 2].close);
      assert.ok(cached, 'successful Fyers fallback should populate cache');
    } finally {
      (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = originalMode;
      global.fetch = originalFetch;
      CacheService.get = originalCacheGet;
      CacheService.set = originalCacheSet;
      FyersAuthService.getAccessToken = originalGetAccessToken;
      FyersAuthService.getCredentials = originalGetCredentials;
      FyersAuthService.clearToken = originalClearToken;
    }
  });

  await t.test('getStockData() skips Fyers fallback when not Connected', async () => {
    const originalMode = env.MARKET_DATA_MODE;
    const originalFetch = global.fetch;
    const originalCacheGet = CacheService.get;
    const originalGetAccessToken = FyersAuthService.getAccessToken;

    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';
    CacheService.get = async () => null;
    FyersAuthService.getAccessToken = async () => null;
    global.fetch = async () =>
      new Response(JSON.stringify({}), { status: 404 });

    try {
      const data = await MarketService.getStockData('LTM', 'NSE');
      assert.strictEqual(data, null, 'without Fyers token, Yahoo failure should still return null');
    } finally {
      (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = originalMode;
      global.fetch = originalFetch;
      CacheService.get = originalCacheGet;
      FyersAuthService.getAccessToken = originalGetAccessToken;
    }
  });

});
