import test from 'node:test';
import assert from 'node:assert';
import { MarketService } from '../../services/market.service';
import { CacheService } from '../../services/cache.service';
import { FyersAuthService } from '../../services/fyers-auth.service';
import { env } from '../../config/env';

test('Fyers 15m VWAP Soft-Fail Decoupling', async (t) => {
  const originalMode = env.MARKET_DATA_MODE;
  const originalFetch = global.fetch;
  const originalCacheGet = CacheService.get;
  const originalCacheSet = CacheService.set;
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetCredentials = FyersAuthService.getCredentials;

  const resetFyersState = () => {
    MarketService.clearFyersQuoteCache();
    MarketService.clearFyersPermissionBlock();
    (MarketService as unknown as { fyersRateLimitedUntilMs: number }).fyersRateLimitedUntilMs = 0;
  };

  const setupMocks = () => {
    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = 'live';
    resetFyersState();

    CacheService.get = async () => null;
    CacheService.set = async () => {};
    FyersAuthService.getAccessToken = async () => 'fyers_test_token';
    FyersAuthService.getCredentials = () => ({
      appId: 'TESTAPP-100',
      secretId: 'secret',
      redirectUrl: 'http://localhost',
    });
  };

  const sampleDailyCandles: Array<[number, number, number, number, number, number]> = [];
  const start = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  for (let i = 0; i < 25; i++) {
    const px = 100 + i;
    sampleDailyCandles.push([start + i * 86400, px, px + 2, px - 2, px, 10000]);
  }

  const sample15mCandles: Array<[number, number, number, number, number, number]> = [
    [Math.floor(Date.now() / 1000) - 900, 100, 105, 98, 102, 5000],
    [Math.floor(Date.now() / 1000), 102, 106, 101, 104, 6000],
  ];

  t.afterEach(() => {
    global.fetch = originalFetch;
    CacheService.get = originalCacheGet;
    CacheService.set = originalCacheSet;
    FyersAuthService.getAccessToken = originalGetAccessToken;
    FyersAuthService.getCredentials = originalGetCredentials;
    (env as { MARKET_DATA_MODE: string }).MARKET_DATA_MODE = originalMode;
    resetFyersState();
  });

  await t.test('1. 15m returns 200 OK with candles: parses VWAP and candle15m, breaker untouched', async () => {
    setupMocks();

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('data/quotes')) {
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          d: [{ n: 'NSE:TCS-EQ', s: 'ok', v: { lp: 3500, open_price: 3480, high_price: 3520, low_price: 3470, prev_close_price: 3450, volume: 100000, atp: 3495 } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('data/history')) {
        if (url.includes('resolution=15')) {
          return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sample15mCandles }), { status: 200 });
        }
        return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sampleDailyCandles }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };

    const res = await MarketService.getStockData('TCS', 'NSE');
    assert.ok(res, 'getStockData should return data');
    assert.strictEqual(res!.ltp, 3500);
    assert.ok(res!.candle15m != null, 'candle15m should be populated');
    assert.strictEqual(MarketService.isFyersTemporarilyUnavailable(), false);
  });

  await t.test('2. 15m returns HTTP 429: soft-fails to typical VWAP without tripping global rate-limit breaker', async () => {
    setupMocks();

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('data/quotes')) {
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          d: [{ n: 'NSE:INFY-EQ', s: 'ok', v: { lp: 1800, open_price: 1790, high_price: 1810, low_price: 1785, prev_close_price: 1780, volume: 50000, atp: 1795 } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('data/history')) {
        if (url.includes('resolution=15')) {
          // HTTP 429 Rate limited on 15m enrichment
          return new Response(JSON.stringify({ s: 'error', code: 429, message: 'Too many requests' }), { status: 429 });
        }
        return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sampleDailyCandles }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };

    const res = await MarketService.getStockData('INFY', 'NSE');
    assert.ok(res, 'getStockData should return data even when 15m 429s');
    assert.strictEqual(res!.ltp, 1800);
    assert.strictEqual(res!.vwap, 1795); // falls back to quote atp
    assert.strictEqual(
      MarketService.isFyersTemporarilyUnavailable(),
      false,
      '15m HTTP 429 must NOT trip global fyersRateLimitedUntilMs'
    );
  });

  await t.test('3. 15m returns HTTP 200 with code 429 / request limit: soft-fails without tripping breaker', async () => {
    setupMocks();

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('data/quotes')) {
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          d: [{ n: 'NSE:WIPRO-EQ', s: 'ok', v: { lp: 550, open_price: 545, high_price: 555, low_price: 540, prev_close_price: 540, volume: 20000 } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('data/history')) {
        if (url.includes('resolution=15')) {
          // Fyers body-level rate limit with HTTP 200
          return new Response(JSON.stringify({ s: 'error', code: 429, message: 'request limit reached' }), { status: 200 });
        }
        return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sampleDailyCandles }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };

    const res = await MarketService.getStockData('WIPRO', 'NSE');
    assert.ok(res, 'getStockData should succeed');
    assert.strictEqual(res!.ltp, 550);
    assert.strictEqual(
      MarketService.isFyersTemporarilyUnavailable(),
      false,
      '15m body-level rate limit must NOT trip global breaker'
    );
  });

  await t.test('4. 15m returns HTTP 403 / permission error: soft-fails without tripping 10m permission cooldown', async () => {
    setupMocks();

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('data/quotes')) {
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          d: [{ n: 'NSE:HCLTECH-EQ', s: 'ok', v: { lp: 1600, open_price: 1590, high_price: 1610, low_price: 1580, prev_close_price: 1580, volume: 30000 } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('data/history')) {
        if (url.includes('resolution=15')) {
          return new Response(JSON.stringify({ s: 'error', code: 403, message: 'additional permission required' }), { status: 403 });
        }
        return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sampleDailyCandles }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };

    const res = await MarketService.getStockData('HCLTECH', 'NSE');
    assert.ok(res, 'getStockData should succeed');
    assert.strictEqual(res!.ltp, 1600);
    assert.strictEqual(
      MarketService.isFyersTemporarilyUnavailable(),
      false,
      '15m 403 permission error must NOT trip fyersPermissionBlockedUntilMs'
    );
  });

  await t.test('5. Multi-symbol scan: Symbol B retains full Fyers primary path after Symbol A 15m 429s', async () => {
    setupMocks();

    let symbolAFetchCount = 0;
    let symbolBFetchCount = 0;

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('data/quotes')) {
        return new Response(JSON.stringify({
          s: 'ok',
          code: 200,
          d: [
            { n: 'NSE:STOCKA-EQ', s: 'ok', v: { lp: 100, open_price: 99, high_price: 101, low_price: 98, prev_close_price: 97, volume: 1000 } },
            { n: 'NSE:STOCKB-EQ', s: 'ok', v: { lp: 200, open_price: 198, high_price: 202, low_price: 197, prev_close_price: 195, volume: 2000 } },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('data/history')) {
        if (url.includes('STOCKA-EQ')) {
          symbolAFetchCount++;
          if (url.includes('resolution=15')) {
            // STOCKA 15m trips 429
            return new Response(JSON.stringify({ s: 'error', code: 429, message: 'Too many requests' }), { status: 429 });
          }
          return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sampleDailyCandles }), { status: 200 });
        }
        if (url.includes('STOCKB-EQ')) {
          symbolBFetchCount++;
          // STOCKB daily history & 15m succeed
          if (url.includes('resolution=15')) {
            return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sample15mCandles }), { status: 200 });
          }
          return new Response(JSON.stringify({ s: 'ok', code: 200, candles: sampleDailyCandles }), { status: 200 });
        }
      }
      return new Response('not found', { status: 404 });
    };

    // Pre-seed quote cache (matching scan behavior)
    await MarketService.prefetchFyersQuotes(['STOCKA', 'STOCKB'], 'NSE');

    // Symbol A runs first, 15m fails with 429
    const stockA = await MarketService.getStockData('STOCKA', 'NSE');
    assert.ok(stockA);
    assert.strictEqual(stockA!.ltp, 100);

    // Symbol B runs second: must NOT be forced to Yahoo fallback!
    const stockB = await MarketService.getStockData('STOCKB', 'NSE');
    assert.ok(stockB);
    assert.strictEqual(stockB!.ltp, 200);
    assert.ok(symbolBFetchCount >= 1, 'STOCKB should hit Fyers history because breaker was not tripped');
    assert.strictEqual(MarketService.isFyersTemporarilyUnavailable(), false);
  });

  await t.test('6. Genuine quote or daily-history 429 STILL trips global rate-limit breaker', async () => {
    setupMocks();

    global.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.includes('data/quotes')) {
        // Genuine quote 429
        return new Response(JSON.stringify({ s: 'error', code: 429, message: 'Too many requests' }), { status: 429 });
      }
      return new Response('not found', { status: 404 });
    };

    const res = await MarketService.getStockData('FAILQUOTES', 'NSE');
    // Quotes failed with 429, so tryFyersPrimary returns null and falls back
    assert.strictEqual(
      MarketService.isFyersTemporarilyUnavailable(),
      true,
      'Genuine quotes 429 must still engage global rate-limit cooldown'
    );
  });
});
