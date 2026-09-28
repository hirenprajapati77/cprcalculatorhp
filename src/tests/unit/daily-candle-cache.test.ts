import test from 'node:test';
import assert from 'node:assert';
import {
  MarketService,
  DAILY_CANDLES_CACHE_TTL_SEC,
  DailyHistoryBundle,
} from '../../services/market.service';
import { CacheService } from '../../services/cache.service';
import { FyersAuthService } from '../../services/fyers-auth.service';
import { env } from '../../config/env';

test('MarketService - Daily Candle Caching & Session TTL', async (suite) => {
  const originalFetch = global.fetch;
  const originalCacheGet = CacheService.get;
  const originalCacheSet = CacheService.set;
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetCredentials = FyersAuthService.getCredentials;
  const originalClearToken = FyersAuthService.clearToken;
  const originalMode = env.MARKET_DATA_MODE;

  function restoreAll(): void {
    global.fetch = originalFetch;
    CacheService.get = originalCacheGet;
    CacheService.set = originalCacheSet;
    FyersAuthService.getAccessToken = originalGetAccessToken;
    FyersAuthService.getCredentials = originalGetCredentials;
    FyersAuthService.clearToken = originalClearToken;
    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = originalMode;
    MarketService.clearFyersQuoteCache();
    MarketService.clearFyersPermissionBlock();
    MarketService.clearFyersRateLimitCooldown();
  }

  suite.afterEach(() => {
    restoreAll();
  });

  await suite.test('dailyCandlesCacheKey formats key with symbol uppercase and date', () => {
    const key1 = MarketService.dailyCandlesCacheKey('reliance', 'NSE', '2026-09-27');
    assert.strictEqual(key1, 'daily_candles_RELIANCE_NSE_2026-09-27');

    const key2 = MarketService.dailyCandlesCacheKey('  tcs  ', 'BSE', '2026-09-27');
    assert.strictEqual(key2, 'daily_candles_TCS_BSE_2026-09-27');

    // Symbol isolation: different symbols produce distinct keys
    assert.notStrictEqual(key1, key2);

    // Market isolation: NSE vs BSE produce distinct keys
    const keyNse = MarketService.dailyCandlesCacheKey('INFY', 'NSE', '2026-09-27');
    const keyBse = MarketService.dailyCandlesCacheKey('INFY', 'BSE', '2026-09-27');
    assert.notStrictEqual(keyNse, keyBse);
  });

  await suite.test('DAILY_CANDLES_CACHE_TTL_SEC is 8 hours (28,800 seconds)', () => {
    assert.strictEqual(DAILY_CANDLES_CACHE_TTL_SEC, 28800);
  });

  await suite.test('fetchDailyHistoryBundle: Cache miss -> fetches Fyers daily -> stores with 8h TTL', async () => {
    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';

    const memoryCache = new Map<string, { value: unknown; ttl?: number | undefined }>();
    CacheService.get = async <T>(key: string): Promise<T | null> => {
      const entry = memoryCache.get(key);
      return (entry ? entry.value : null) as T | null;
    };
    CacheService.set = async (key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
      memoryCache.set(key, { value, ttl: ttlSeconds });
    };

    FyersAuthService.getAccessToken = async () => 'mock_fyers_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    // Build 50 daily candles
    const baseEpoch = Math.floor(new Date('2026-07-01T03:45:00Z').getTime() / 1000);
    const mockFyersCandles: Array<[number, number, number, number, number, number]> = [];
    for (let i = 0; i < 50; i++) {
      const epoch = baseEpoch + i * 86400;
      mockFyersCandles.push([epoch, 100 + i, 105 + i, 95 + i, 102 + i, 10000 + i * 100]);
    }

    let fyersHistoryCalls = 0;
    let yahooCalls = 0;

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('api-t1.fyers.in/data/history') && url.includes('resolution=D')) {
        fyersHistoryCalls++;
        return new Response(JSON.stringify({ s: 'ok', code: 200, candles: mockFyersCandles }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('query1.finance.yahoo.com')) {
        yahooCalls++;
        return new Response('{}', { status: 404 });
      }
      return new Response('{}', { status: 404 });
    };

    const bundle = await MarketService.fetchDailyHistoryBundle('RELIANCE', 'NSE', '2026-09-27');

    assert.ok(bundle, 'bundle should be returned');
    assert.strictEqual(bundle!.source, 'fyers');
    assert.strictEqual(fyersHistoryCalls, 1, 'Fyers history should be called once on miss');
    assert.strictEqual(yahooCalls, 0, 'Yahoo should not be called when Fyers succeeds');
    assert.strictEqual(bundle!.history.length, 22, 'history should be truncated to last 22 candles');
    assert.ok(typeof bundle!.sma20Slope === 'number');
    assert.ok(typeof bundle!.sma50Slope === 'number');
    assert.ok(bundle!.previousClose > 0);
    assert.ok(bundle!.avgVolume > 0);

    // Verify cache storage with 8-hour TTL
    const cacheKey = MarketService.dailyCandlesCacheKey('RELIANCE', 'NSE', '2026-09-27');
    const cachedEntry = memoryCache.get(cacheKey);
    assert.ok(cachedEntry, 'bundle must be stored in cache');
    assert.strictEqual(cachedEntry!.ttl, 28800, 'cache TTL must be 8 hours (28,800s)');
    assert.strictEqual((cachedEntry!.value as DailyHistoryBundle).source, 'fyers');
  });

  await suite.test('fetchDailyHistoryBundle: Cache hit -> returns cached bundle with ZERO HTTP calls', async () => {
    const cachedBundle: DailyHistoryBundle = {
      history: [
        { date: '2026-09-25', open: 2900, high: 2950, low: 2890, close: 2940, volume: 500000 },
        { date: '2026-09-26', open: 2940, high: 2980, low: 2930, close: 2975, volume: 600000 },
      ],
      sma20Slope: 1.25,
      sma50Slope: 3.5,
      lastCandle: { date: '2026-09-26', open: 2940, high: 2980, low: 2930, close: 2975, volume: 600000 },
      previousClose: 2940,
      avgVolume: 550000,
      source: 'fyers',
    };

    const cacheKey = MarketService.dailyCandlesCacheKey('RELIANCE', 'NSE', '2026-09-27');
    CacheService.get = async <T>(key: string): Promise<T | null> => {
      if (key === cacheKey) {
        return cachedBundle as T;
      }
      return null;
    };

    let httpCalls = 0;
    global.fetch = async (): Promise<Response> => {
      httpCalls++;
      return new Response('{}', { status: 500 });
    };

    const bundle = await MarketService.fetchDailyHistoryBundle('RELIANCE', 'NSE', '2026-09-27');

    assert.ok(bundle, 'bundle should be returned from cache');
    assert.strictEqual(httpCalls, 0, 'zero external HTTP calls on cache hit');
    assert.strictEqual(bundle!.source, 'fyers');
    assert.strictEqual(bundle!.history.length, 2);
    assert.strictEqual(bundle!.sma20Slope, 1.25);
    assert.strictEqual(bundle!.previousClose, 2940);
  });

  await suite.test('fetchDailyHistoryBundle: Date rollover naturally misses yesterday cache', async () => {
    const memoryCache = new Map<string, { value: unknown; ttl?: number | undefined }>();
    CacheService.get = async <T>(key: string): Promise<T | null> => {
      const entry = memoryCache.get(key);
      return (entry ? entry.value : null) as T | null;
    };
    CacheService.set = async (key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
      memoryCache.set(key, { value, ttl: ttlSeconds });
    };

    // Pre-populate cache for 2026-09-26
    const yesterdayBundle: DailyHistoryBundle = {
      history: [{ date: '2026-09-25', open: 100, high: 110, low: 95, close: 105, volume: 1000 }],
      sma20Slope: 0,
      sma50Slope: 0,
      lastCandle: { date: '2026-09-25', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
      previousClose: 100,
      avgVolume: 1000,
      source: 'fyers',
    };
    memoryCache.set(
      MarketService.dailyCandlesCacheKey('TCS', 'NSE', '2026-09-26'),
      { value: yesterdayBundle, ttl: 28800 }
    );

    FyersAuthService.getAccessToken = async () => 'mock_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    let fetchCount = 0;
    global.fetch = async (): Promise<Response> => {
      fetchCount++;
      return new Response(JSON.stringify({
        s: 'ok',
        code: 200,
        candles: [
          [Math.floor(Date.now() / 1000), 200, 210, 195, 205, 5000],
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    // Calling for today 2026-09-27: should miss 2026-09-26 cache and fetch fresh
    const bundle = await MarketService.fetchDailyHistoryBundle('TCS', 'NSE', '2026-09-27');

    assert.ok(bundle);
    assert.strictEqual(fetchCount, 1, 'date rollover must fetch fresh daily data');
    assert.strictEqual(bundle!.lastCandle.close, 205);
    // New key is populated
    assert.ok(memoryCache.has(MarketService.dailyCandlesCacheKey('TCS', 'NSE', '2026-09-27')));
  });

  await suite.test('fetchDailyHistoryBundle: Fyers failure -> Yahoo daily fallback succeeds and is cached', async () => {
    const memoryCache = new Map<string, { value: unknown; ttl?: number | undefined }>();
    CacheService.get = async <T>(key: string): Promise<T | null> => {
      const entry = memoryCache.get(key);
      return (entry ? entry.value : null) as T | null;
    };
    CacheService.set = async (key: string, value: unknown, ttlSeconds?: number): Promise<void> => {
      memoryCache.set(key, { value, ttl: ttlSeconds });
    };

    FyersAuthService.getAccessToken = async () => 'mock_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    const t1 = Date.UTC(2026, 6, 20) / 1000;
    const t2 = Date.UTC(2026, 6, 21) / 1000;

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('api-t1.fyers.in')) {
        // Fyers fails with 429
        return new Response(JSON.stringify({ s: 'error', code: 429, message: 'Too many requests' }), {
          status: 429,
        });
      }
      if (url.includes('interval=1d')) {
        // Yahoo returns valid daily chart
        return new Response(JSON.stringify({
          chart: {
            result: [{
              meta: { regularMarketPrice: 3500 },
              timestamp: [t1, t2],
              indicators: {
                quote: [{
                  open: [3400, 3450],
                  high: [3480, 3520],
                  low: [3390, 3440],
                  close: [3450, 3500],
                  volume: [100000, 120000],
                }],
              },
            }],
          },
        }), { status: 200 });
      }
      return new Response('{}', { status: 500 });
    };

    const bundle = await MarketService.fetchDailyHistoryBundle('INFY', 'NSE', '2026-09-27');

    assert.ok(bundle, 'bundle should be returned via Yahoo fallback');
    assert.strictEqual(bundle!.source, 'yahoo');
    assert.strictEqual(bundle!.lastCandle.close, 3500);
    assert.strictEqual(bundle!.regularMarketPrice, 3500);

    // Verify it was cached with 8-hour TTL
    const cacheKey = MarketService.dailyCandlesCacheKey('INFY', 'NSE', '2026-09-27');
    const cachedEntry = memoryCache.get(cacheKey);
    assert.ok(cachedEntry, 'Yahoo fallback bundle must be cached');
    assert.strictEqual(cachedEntry!.ttl, 28800);
    assert.strictEqual((cachedEntry!.value as DailyHistoryBundle).source, 'yahoo');
  });

  await suite.test('fetchDailyHistoryBundle: Fail-open on CacheService read and write exceptions', async () => {
    // Cache read throws network error
    CacheService.get = async () => {
      throw new Error('Redis connection timed out');
    };
    // Cache write throws
    CacheService.set = async () => {
      throw new Error('Redis write failed');
    };

    FyersAuthService.getAccessToken = async () => 'mock_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('api-t1.fyers.in')) {
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          candles: [
            [Math.floor(Date.now() / 1000), 500, 520, 490, 510, 10000],
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    };

    // Must not throw — fails open to network
    const bundle = await MarketService.fetchDailyHistoryBundle('SBIN', 'NSE', '2026-09-27');

    assert.ok(bundle, 'must fail-open and return bundle even if cache read/write throws');
    assert.strictEqual(bundle!.lastCandle.close, 510);
  });

  await suite.test('getStockData: Uses 8h daily candle cache while keeping 15m intraday data fresh', async () => {
    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';

    // Seed daily candle cache for RELIANCE
    const cachedDailyBundle: DailyHistoryBundle = {
      history: [
        { date: '2026-09-25', open: 2900, high: 2950, low: 2890, close: 2940, volume: 500000 },
        { date: '2026-09-26', open: 2940, high: 2980, low: 2930, close: 2975, volume: 600000 },
      ],
      sma20Slope: 2.5,
      sma50Slope: 5.0,
      lastCandle: { date: '2026-09-26', open: 2940, high: 2980, low: 2930, close: 2975, volume: 600000 },
      previousClose: 2940,
      avgVolume: 550000,
      source: 'fyers',
    };

    const dailyKey = MarketService.dailyCandlesCacheKey('RELIANCE', 'NSE');
    CacheService.get = async <T>(key: string): Promise<T | null> => {
      // Simulate stock_data cache miss to force getStockData execution
      if (key.startsWith('stock_data_')) return null;
      // Daily candle cache hit
      if (key === dailyKey) return cachedDailyBundle as T;
      return null;
    };
    CacheService.set = async () => {};

    // Seed Fyers quote in process cache (fresh live quote)
    MarketService.seedFyersQuoteCache('RELIANCE', 'NSE', {
      lp: 2999.5,
      open_price: 2980,
      high_price: 3010,
      low_price: 2970,
      prev_close_price: 2975,
      atp: 2990,
      volume: 800000,
    });

    FyersAuthService.getAccessToken = async () => 'mock_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'x',
      redirectUrl: 'http://localhost',
    });

    let dailyHistoryCalled = false;
    let intraday15mCalled = false;

    const t0 = Math.floor(Date.now() / 1000);
    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('resolution=D')) {
        dailyHistoryCalled = true;
        return new Response('{}', { status: 500 });
      }
      if (url.includes('resolution=15')) {
        intraday15mCalled = true;
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          candles: [
            [t0, 2980, 3010, 2970, 2999.5, 50000],
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 500 });
    };

    const data = await MarketService.getStockData('RELIANCE', 'NSE');

    assert.ok(data, 'getStockData should return data');
    assert.strictEqual(dailyHistoryCalled, false, 'Daily history must NOT be called when daily cache hits');
    assert.strictEqual(intraday15mCalled, true, '15m intraday must be called to ensure freshness');
    assert.strictEqual(data!.ltp, 2999.5, 'LTP comes from live quote, not cached daily close');
    assert.strictEqual(data!.sma20Slope, 2.5, 'Slopes come from cached daily history');
    assert.strictEqual(data!.history?.length, 2, 'History comes from cached daily history');
    assert.ok(data!.candle15m, '15m candle populated from fresh intraday fetch');
    assert.strictEqual(data!.candle15m!.close, 2999.5);
  });
});
