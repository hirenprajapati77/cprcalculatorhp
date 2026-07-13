import test from 'node:test';
import assert from 'node:assert';
import { MarketService, MarketStockData } from '../services/market.service';
import { CacheService } from '../services/cache.service';

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

});
