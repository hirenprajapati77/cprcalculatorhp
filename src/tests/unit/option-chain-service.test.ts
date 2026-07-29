import test from 'node:test';
import assert from 'node:assert';
import { OptionChainService } from '../../services/option-chain.service';
import { CacheService } from '../../services/cache.service';
import { FyersAuthService } from '../../services/fyers-auth.service';
import { env } from '../../config/env';
import { getISTTime } from '../../lib/market-hours';

test('OptionChainService fetchOptionQuote regex supports &', async (_t) => {
  let fetchedSymbol = '';
  
  // Mock getOptionChain
  const originalGetOptionChain = OptionChainService.getOptionChain;
  OptionChainService.getOptionChain = async (symbol: string) => {
    fetchedSymbol = symbol;
    return {
      expiryData: [],
      optionsChain: [
        { symbol: `NSE:${symbol}25JUL2900CE`, strikePrice: 2900, optionType: 'CE', ltp: 150.5 }
      ],
      method: 'direct'
    };
  };

  try {
    const ltp = await OptionChainService.fetchOptionQuote('NSE:M&M25JUL2900CE');
    assert.strictEqual(ltp, 150.5, 'Should correctly extract LTP');
    assert.strictEqual(fetchedSymbol, 'M&M', 'Should correctly parse underlying symbol with &');
  } finally {
    OptionChainService.getOptionChain = originalGetOptionChain;
  }
});

test('OptionChainService rollover logic and cache partitioning', async () => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetCredentials = FyersAuthService.getCredentials;
  const originalGet = CacheService.get;
  const originalSet = CacheService.set;
  // @ts-expect-error test mock
  const originalFetchWithRetry = OptionChainService.fetchWithRetry;

  FyersAuthService.getAccessToken = async () => 'dummy_token';
  FyersAuthService.getCredentials = () => ({ appId: 'dummy_id', secretId: '', redirectUrl: '' });
  CacheService.get = async () => null; // Always miss cache

  const cacheKeysSet: string[] = [];
  CacheService.set = async (key: string) => {
    cacheKeysSet.push(key);
  };


  // @ts-expect-error test mock
  OptionChainService.fetchWithRetry = async (url: string) => {

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth()+1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;
    
    // If it's the second call (rollover), return next week's chain
    if (url.includes('timestamp=')) {
      return {
        ok: true, status: 200, json: async () => ({
          s: 'ok',
          data: {
            expiryData: [nextWeekStr],
            optionsChain: [{ symbol: 'NEXT_WEEK_OPTION', strikePrice: 20000, optionType: 'CE', ltp: 200 }]
          }
        })
      };
    }
    
    // First call: returns today's expiry
    return {
      ok: true, status: 200, json: async () => ({
        s: 'ok',
        data: {
          expiryData: [todayStr, { date: nextWeekStr, expiry: 1234567890 }],
          optionsChain: [{ symbol: 'TODAY_OPTION', strikePrice: 20000, optionType: 'CE', ltp: 100 }]
        }
      })
    };
  };

  try {
    // Test 1: allowRollover = true (default)
    const resTrue = await OptionChainService.getOptionChain('NIFTY', true);
    assert.strictEqual(!('error' in resTrue) && resTrue.optionsChain[0].symbol, 'NEXT_WEEK_OPTION', 'allowRollover=true should return next expiry');
    assert.ok(cacheKeysSet.includes('option_chain_NIFTY_rollover'), 'Should cache with _rollover key');

    // Test 2: allowRollover = false
    const resFalse = await OptionChainService.getOptionChain('NIFTY', false);
    assert.strictEqual(!('error' in resFalse) && resFalse.optionsChain[0].symbol, 'TODAY_OPTION', 'allowRollover=false should return current expiry');
    assert.ok(cacheKeysSet.includes('option_chain_NIFTY_current'), 'Should cache with _current key');
    
    // Test 3: Ensure keys are different
    assert.notStrictEqual('option_chain_NIFTY_rollover', 'option_chain_NIFTY_current');

  } finally {
    FyersAuthService.getAccessToken = originalGetAccessToken;
    FyersAuthService.getCredentials = originalGetCredentials;
    CacheService.get = originalGet;
    CacheService.set = originalSet;
    // @ts-expect-error test mock
    OptionChainService.fetchWithRetry = originalFetchWithRetry;
  }
});

test('OptionChainService applies rollover when direct fetch falls back to proxy', async () => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetCredentials = FyersAuthService.getCredentials;
  const originalGet = CacheService.get;
  const originalSet = CacheService.set;
  const originalProxyUrl = env.FYERS_AUTH_PROXY_URL;
  const originalFetch = global.fetch;
  // @ts-expect-error test mock
  const originalFetchWithRetry = OptionChainService.fetchWithRetry;

  FyersAuthService.getAccessToken = async () => 'dummy_token';
  FyersAuthService.getCredentials = () => ({ appId: 'dummy_id', secretId: '', redirectUrl: '' });
  CacheService.get = async () => null;
  CacheService.set = async () => {};
  env.FYERS_AUTH_PROXY_URL = 'https://proxy.example.test';

  // @ts-expect-error test mock
  OptionChainService.fetchWithRetry = async () => {
    throw new Error('direct unavailable');
  };

  const todayStr = getISTTime().dateString;
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;
  const requestedUrls: string[] = [];

  global.fetch = async (url: string | URL | Request) => {
    const requestUrl = String(url);
    requestedUrls.push(requestUrl);

    if (requestUrl.includes('timestamp=')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          s: 'ok',
          data: {
            expiryData: [nextWeekStr],
            optionsChain: [{ symbol: 'PROXY_NEXT_WEEK_OPTION', strikePrice: 20000, optionType: 'CE', ltp: 200 }]
          }
        })
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        s: 'ok',
        data: {
          expiryData: [todayStr, { date: nextWeekStr, expiry: 9876543210 }],
          optionsChain: [{ symbol: 'PROXY_TODAY_OPTION', strikePrice: 20000, optionType: 'CE', ltp: 100 }]
        }
      })
    } as Response;
  };

  try {
    const result = await OptionChainService.getOptionChain('NIFTY', true);

    assert.strictEqual(!('error' in result) && result.method, 'proxy');
    assert.strictEqual(!('error' in result) && result.optionsChain[0].symbol, 'PROXY_NEXT_WEEK_OPTION');
    assert.ok(
      requestedUrls.some((url) => url.includes('timestamp=9876543210')),
      'proxy fallback should refetch next expiry with timestamp'
    );
  } finally {
    FyersAuthService.getAccessToken = originalGetAccessToken;
    FyersAuthService.getCredentials = originalGetCredentials;
    CacheService.get = originalGet;
    CacheService.set = originalSet;
    env.FYERS_AUTH_PROXY_URL = originalProxyUrl;
    global.fetch = originalFetch;
    // @ts-expect-error test mock
    OptionChainService.fetchWithRetry = originalFetchWithRetry;
  }
});


test('OptionChainService resolveRolledOverChain parses targetExpiryStr (monthly vs weekly)', async () => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetCredentials = FyersAuthService.getCredentials;
  const originalGet = CacheService.get;
  const originalSet = CacheService.set;
  // @ts-expect-error test mock
  const originalFetchWithRetry = OptionChainService.fetchWithRetry;

  FyersAuthService.getAccessToken = async () => 'test_token';
  FyersAuthService.getCredentials = () => ({ appId: 'app', secretId: 'secret', redirectUrl: 'url' });
  CacheService.get = async () => null;
  CacheService.set = async () => {};

  let requestedUrl = '';
  // @ts-expect-error test mock
  OptionChainService.fetchWithRetry = async (url) => {
    requestedUrl = url;
    if (url.includes('timestamp=')) {
      return {
        ok: true,
        json: async () => ({
          s: 'ok',
          data: {
            expiryData: [],
            optionsChain: [{ symbol: 'MATCHED_OPTION', strikePrice: 100, optionType: 'CE', ltp: 10 }]
          }
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        s: 'ok',
        data: {
          expiryData: [
            { expiry: '11111', date: '2026-07-30' },
            { expiry: '22222', date: '2026-08-27' }
          ],
          optionsChain: [{ symbol: 'BASE_OPTION', strikePrice: 100, optionType: 'CE', ltp: 10 }]
        }
      })
    };
  };

  try {
    const resMonthly = await OptionChainService.getOptionChain('NIFTY', true, 'AUG 2026');
    assert.ok(!('error' in resMonthly), 'Monthly fetch should succeed');
    assert.strictEqual(!('error' in resMonthly) && resMonthly.optionsChain[0].symbol, 'MATCHED_OPTION');
    assert.ok(requestedUrl.includes('timestamp=22222'), 'Monthly target should fetch timestamp 22222');

    const resWeekly = await OptionChainService.getOptionChain('NIFTY', true, '30 JUL 2026');
    assert.ok(!('error' in resWeekly), 'Weekly fetch should succeed');
    assert.ok(requestedUrl.includes('timestamp=11111'), 'Weekly target should fetch timestamp 11111');
    
    requestedUrl = '';
    const resMismatch = await OptionChainService.getOptionChain('NIFTY', true, '29 JUL 2026');
    assert.ok(!('error' in resMismatch), 'Mismatch fetch should succeed (returns base chain)');
    assert.strictEqual(!('error' in resMismatch) && resMismatch.optionsChain[0].symbol, 'BASE_OPTION', 'Mismatch should return base options');
    assert.ok(!requestedUrl.includes('timestamp='), 'Mismatch should not fetch any target timestamp');
    
  } finally {
    FyersAuthService.getAccessToken = originalGetAccessToken;
    FyersAuthService.getCredentials = originalGetCredentials;
    CacheService.get = originalGet;
    CacheService.set = originalSet;
    // @ts-expect-error test mock
    OptionChainService.fetchWithRetry = originalFetchWithRetry;
  }
});
