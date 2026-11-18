import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toFyersEquitySymbol,
  fromFyersEquitySymbol,
  toFyersUnderlyingSymbol,
  fromFyersUnderlyingSymbol,
  parseFyersQuotesResponse,
  FYERS_SYMBOL_ALIASES,
  FYERS_REVERSE_SYMBOL_ALIASES,
} from '../../services/fyers-quotes-batch';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { OptionChainService } from '../../services/option-chain.service';
import { FyersAuthService } from '../../services/fyers-auth.service';
import { CacheService } from '../../services/cache.service';
import { OvernightService } from '../../services/overnight/overnight.service';
import { MarketService, MarketStockData } from '../../services/market.service';

test('Fyers Symbol Alias & Translation Architecture', async (t) => {
  await t.test('1. toFyersEquitySymbol maps aliased equity and preserves index formats', () => {
    // Aliased ticker
    assert.equal(toFyersEquitySymbol('ICICIPRULI', 'NSE'), 'NSE:ICICILIFE-EQ');
    assert.equal(toFyersEquitySymbol('icicipruli', 'NSE'), 'NSE:ICICILIFE-EQ');
    assert.equal(toFyersEquitySymbol('ICICIPRULI', 'BSE'), 'BSE:ICICILIFE-EQ');

    // Standard unaliased ticker
    assert.equal(toFyersEquitySymbol('RELIANCE', 'NSE'), 'NSE:RELIANCE-EQ');
    assert.equal(toFyersEquitySymbol('SBIN', 'BSE'), 'BSE:SBIN-EQ');

    // Index formats
    assert.equal(toFyersEquitySymbol('NIFTY', 'NSE'), 'NSE:NIFTY50-INDEX');
    assert.equal(toFyersEquitySymbol('BANKNIFTY', 'NSE'), 'NSE:NIFTYBANK-INDEX');
    assert.equal(toFyersEquitySymbol('SENSEX', 'BSE'), 'BSE:SENSEX-INDEX');
  });

  await t.test('2. fromFyersEquitySymbol maps Fyers ticker back to canonical platform key', () => {
    // Reverse aliased ticker
    assert.equal(fromFyersEquitySymbol('NSE:ICICILIFE-EQ'), 'ICICIPRULI');
    assert.equal(fromFyersEquitySymbol('BSE:ICICILIFE-EQ'), 'ICICIPRULI');

    // Standard ticker round-trip
    assert.equal(fromFyersEquitySymbol('NSE:RELIANCE-EQ'), 'RELIANCE');
    assert.equal(fromFyersEquitySymbol('BSE:SBIN-EQ'), 'SBIN');

    // Index round-trip
    assert.equal(fromFyersEquitySymbol('NSE:NIFTY50-INDEX'), 'NIFTY');
    assert.equal(fromFyersEquitySymbol('NSE:NIFTYBANK-INDEX'), 'BANKNIFTY');
    assert.equal(fromFyersEquitySymbol('BSE:SENSEX-INDEX'), 'SENSEX');
  });

  await t.test('3. toFyersUnderlyingSymbol maps canonical ticker to Fyers underlying', () => {
    assert.equal(toFyersUnderlyingSymbol('ICICIPRULI'), 'ICICILIFE');
    assert.equal(toFyersUnderlyingSymbol('icicipruli'), 'ICICILIFE');
    assert.equal(toFyersUnderlyingSymbol('ICICIPRULI-EQ'), 'ICICILIFE');
    assert.equal(toFyersUnderlyingSymbol('RELIANCE'), 'RELIANCE');
    assert.equal(toFyersUnderlyingSymbol('NIFTY'), 'NIFTY');
  });

  await t.test('4. fromFyersUnderlyingSymbol reverses Fyers underlying back to canonical', () => {
    assert.equal(fromFyersUnderlyingSymbol('ICICILIFE'), 'ICICIPRULI');
    assert.equal(fromFyersUnderlyingSymbol('icicilife'), 'ICICIPRULI');
    assert.equal(fromFyersUnderlyingSymbol('RELIANCE'), 'RELIANCE');
    // Derived reverse table sanity check
    assert.equal(FYERS_REVERSE_SYMBOL_ALIASES['ICICILIFE'], 'ICICIPRULI');
  });

  await t.test('5. OptionChainService requests NSE:ICICILIFE-EQ for ICICIPRULI underlying', async () => {
    const origGetAccessToken = FyersAuthService.getAccessToken;
    const origGetCredentials = FyersAuthService.getCredentials;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origFetchWithRetry = (OptionChainService as any).fetchWithRetry;
    const origCacheGet = CacheService.get;
    const origCacheSet = CacheService.set;

    let requestedUrl = '';
    try {
      CacheService.get = async () => null;
      CacheService.set = async () => {};
      FyersAuthService.getAccessToken = async () => 'test_token';
      FyersAuthService.getCredentials = () => ({
        appId: 'TEST_APP-100',
        secretId: 'test_secret',
        redirectUrl: 'http://localhost',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (OptionChainService as any).fetchWithRetry = async (url: string) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            s: 'ok',
            data: {
              expiryData: [{ date: '2026-11-26' }],
              optionsChain: [
                { symbol: 'NSE:ICICILIFE26NOV460CE', strike_price: 460, ltp: 12.5 },
              ],
            },
          }),
        } as unknown as Response;
      };

      const result = await OptionChainService.getOptionChain('ICICIPRULI');
      assert.ok(!('error' in result));
      assert.ok(requestedUrl.includes('symbol=NSE%3AICICILIFE-EQ'), `Expected URL to include NSE:ICICILIFE-EQ, got: ${requestedUrl}`);
    } finally {
      FyersAuthService.getAccessToken = origGetAccessToken;
      FyersAuthService.getCredentials = origGetCredentials;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (OptionChainService as any).fetchWithRetry = origFetchWithRetry;
      CacheService.get = origCacheGet;
      CacheService.set = origCacheSet;
    }
  });

  await t.test('6. OvernightService fetchFyersIntradayMetrics maps ICICIPRULI to NSE:ICICILIFE-EQ', async () => {
    const origUnavailable = MarketService.isFyersTemporarilyUnavailable;
    const origGetAccessToken = FyersAuthService.getAccessToken;
    const origGetCredentials = FyersAuthService.getCredentials;
    const origFetch = global.fetch;

    let fetchedUrl = '';
    try {
      MarketService.isFyersTemporarilyUnavailable = () => false;
      FyersAuthService.getAccessToken = async () => 'test_token';
      FyersAuthService.getCredentials = () => ({
        appId: 'TEST_APP-100',
        secretId: 'test_secret',
        redirectUrl: 'http://localhost',
      });
      global.fetch = async (input: RequestInfo | URL) => {
        fetchedUrl = String(input);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            s: 'ok',
            candles: [
              [Math.floor(Date.now() / 1000) - 300, 450, 455, 449, 453, 1000],
            ],
          }),
        } as Response;
      };

      const mockStock: MarketStockData = {
        symbol: 'ICICIPRULI',
        market: 'NSE',
        sector: 'Financial Services',
        open: 450,
        high: 455,
        low: 449,
        close: 453.2,
        previousClose: 450,
        volume: 50000,
        avgVolume: 50000,
        marketCap: 20000,
        ltp: 453.2,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metrics = await (OvernightService as any).fetchFyersIntradayMetrics(mockStock, new Date());
      assert.ok(metrics !== null);
      assert.ok(fetchedUrl.includes('symbol=NSE%3AICICILIFE-EQ'), `Expected URL to include symbol=NSE%3AICICILIFE-EQ, got: ${fetchedUrl}`);
    } finally {
      MarketService.isFyersTemporarilyUnavailable = origUnavailable;
      FyersAuthService.getAccessToken = origGetAccessToken;
      FyersAuthService.getCredentials = origGetCredentials;
      global.fetch = origFetch;
    }
  });

  await t.test('7. OptionSuggestionService parses expiry and DTE for ICICILIFE contract with ICICIPRULI underlying', () => {
    // extractFyersOptionExpiry
    const expiryStr = OptionSuggestionService.extractFyersOptionExpiry(
      'NSE:ICICILIFE26NOV460CE',
      'ICICIPRULI',
      460,
      'CE'
    );
    assert.equal(expiryStr, 'NOV 2026');

    // extractFyersOptionExpiry with BSE prefix / weekly
    const weeklyExpiryStr = OptionSuggestionService.extractFyersOptionExpiry(
      'NSE:ICICILIFE26N19460CE',
      'ICICIPRULI',
      460,
      'CE'
    );
    assert.equal(weeklyExpiryStr, '19 NOV 2026');

    // Standard unaliased underlying should still parse identically
    const relExpiry = OptionSuggestionService.extractFyersOptionExpiry(
      'NSE:RELIANCE26NOV1300CE',
      'RELIANCE',
      1300,
      'CE'
    );
    assert.equal(relExpiry, 'NOV 2026');
  });

  await t.test('8. parseFyersQuotesResponse indexes NSE:ICICILIFE-EQ row under canonical ICICIPRULI key', () => {
    const apiPayload = {
      s: 'ok',
      d: [
        {
          s: 'ok',
          n: 'NSE:ICICILIFE-EQ',
          v: {
            lp: 453.2,
            open_price: 458.1,
            high_price: 462.0,
            low_price: 451.0,
            prev_close_price: 461.1,
            atp: 455.5,
            volume: 510040,
          },
        },
        {
          s: 'ok',
          n: 'NSE:RELIANCE-EQ',
          v: {
            lp: 1250.0,
            open_price: 1245.0,
            high_price: 1255.0,
            low_price: 1240.0,
            prev_close_price: 1242.0,
            atp: 1248.0,
            volume: 1200000,
          },
        },
      ],
    };

    const quoteMap = parseFyersQuotesResponse(apiPayload, 'NSE');

    // Test 8 load-bearing assertion: Must be stored under ICICIPRULI, not ICICILIFE
    assert.ok(quoteMap.has('ICICIPRULI'), 'Map should contain canonical key ICICIPRULI');
    assert.ok(!quoteMap.has('ICICILIFE'), 'Map should NOT store under raw unaliased key ICICILIFE');

    const iciciQuote = quoteMap.get('ICICIPRULI');
    assert.equal(iciciQuote?.lp, 453.2);
    assert.equal(iciciQuote?.prev_close_price, 461.1);
    assert.equal(iciciQuote?.volume, 510040);

    // Standard ticker still stored normally
    assert.ok(quoteMap.has('RELIANCE'));
    assert.equal(quoteMap.get('RELIANCE')?.lp, 1250.0);
  });
});
