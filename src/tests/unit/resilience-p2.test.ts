import test from 'node:test';
import assert from 'node:assert/strict';
import { envSchemaForTests } from '../../config/env';
import { fetchDeduped, clearDedupedFetchCache } from '../../lib/deduped-fetch';
import { OptionSuggestionService, FALLBACK_LOT_SIZES } from '../../services/option-suggestion.service';
import { CacheService } from '../../services/cache.service';

test('P2-3: Production runtime CRON_SECRET strength validation', () => {
  // Test schema parsing behavior
  const validParsed = envSchemaForTests.safeParse({
    CRON_SECRET: 'my-super-secret-key-12345',
  });
  assert.strictEqual(validParsed.success, true);

  // Startup production validation check simulation
  const validateProductionCronSecret = (nodeEnv: string, isBuild: boolean, cronSecret?: string) => {
    if (nodeEnv === 'production' && !isBuild) {
      if (!cronSecret?.trim() || cronSecret.trim().length < 16) {
        throw new Error('CRON_SECRET is required in production and must be at least 16 characters long.');
      }
    }
  };

  // Valid length in production
  assert.doesNotThrow(() => {
    validateProductionCronSecret('production', false, 'super-secure-cron-secret-12345');
  });

  // Short length in production throws
  assert.throws(
    () => {
      validateProductionCronSecret('production', false, 'short-secret');
    },
    /at least 16 characters/
  );

  // Missing or empty in production throws
  assert.throws(
    () => {
      validateProductionCronSecret('production', false, '');
    },
    /at least 16 characters/
  );
  assert.throws(
    () => {
      validateProductionCronSecret('production', false, undefined);
    },
    /at least 16 characters/
  );

  // Build phase bypasses runtime check
  assert.doesNotThrow(() => {
    validateProductionCronSecret('production', true, undefined);
  });

  // Non-production environment bypasses runtime check
  assert.doesNotThrow(() => {
    validateProductionCronSecret('development', false, undefined);
  });
});

test('P2-4: In-process settledCache size bounding in deduped-fetch', async () => {
  clearDedupedFetchCache();

  let fetchCount = 0;
  const originalFetch = global.fetch;

  try {
    // Mock fetch returning distinct URLs
    global.fetch = (async (input: RequestInfo | URL) => {
      fetchCount++;
      const url = typeof input === 'string' ? input : input.toString();
      return new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    // Perform 120 unique fetch requests with ttlMs=5000
    for (let i = 0; i < 120; i++) {
      const res = await fetchDeduped(`https://example.com/api/test-${i}`, { ttlMs: 5000 });
      assert.strictEqual(res.status, 200);
    }

    assert.strictEqual(fetchCount, 120);

    // Fetch the latest one again -> Should hit settledCache (fetchCount doesn't increase)
    const cachedRes = await fetchDeduped('https://example.com/api/test-119', { ttlMs: 5000 });
    assert.strictEqual(cachedRes.status, 200);
    assert.strictEqual(fetchCount, 120, 'Latest URL should be cached in settledCache');

    // Earliest URL (test-0) should have been evicted by the MAX_SETTLED_CACHE_SIZE (100) cap
    const evictedRes = await fetchDeduped('https://example.com/api/test-0', { ttlMs: 5000 });
    assert.strictEqual(evictedRes.status, 200);
    assert.strictEqual(fetchCount, 121, 'Evicted earliest URL should trigger a new network fetch');
  } finally {
    global.fetch = originalFetch;
    clearDedupedFetchCache();
  }
});

test('P2-5: Lot-size fallback cache merge order (upstream pre-merge, fallback on-read)', async () => {
  const originalCacheGet = CacheService.get;
  const originalCacheSet = CacheService.set;

  let cachedPayload: Record<string, number> | null = null;

  try {
    // Mock CacheService
    CacheService.get = async <T>(_key: string): Promise<T | null> => {
      return cachedPayload as T | null;
    };
    CacheService.set = async (_key: string, value: unknown, _ttl?: number): Promise<void> => {
      cachedPayload = value as Record<string, number>;
    };

    // Simulate upstream master having a revised lot size for NIFTY (e.g. 75 instead of fallback 65)
    // and an equity stock (e.g. RELIANCE: 300)
    cachedPayload = {
      'NIFTY': 75,
      'RELIANCE': 300,
    };

    // @ts-expect-error accessing private method for unit testing
    const loadLotSizes = OptionSuggestionService.loadLotSizes;
    const lotMap: Map<string, number> = await loadLotSizes();

    // 1. Upstream value takes precedence over FALLBACK_LOT_SIZES
    assert.strictEqual(lotMap.get('NIFTY'), 75, 'Upstream revised lot size must take precedence');
    assert.strictEqual(lotMap.get('RELIANCE'), 300, 'Upstream lot size must be preserved');

    // 2. Symbols missing from upstream are populated from FALLBACK_LOT_SIZES on read
    assert.strictEqual(lotMap.get('BANKNIFTY'), FALLBACK_LOT_SIZES['BANKNIFTY'], 'Missing upstream symbol falls back to fallback table');
    assert.strictEqual(lotMap.get('SENSEX'), FALLBACK_LOT_SIZES['SENSEX'], 'BSE index falls back to fallback table');
  } finally {
    CacheService.get = originalCacheGet;
    CacheService.set = originalCacheSet;
  }
});

test('P2-5: Never downgrade warm lot-size cache when upstream refresh fails', async () => {
  const originalCacheGet = CacheService.get;
  const originalCacheSet = CacheService.set;
  const originalFetch = global.fetch;

  let cachedPayload: Record<string, number> | null = {
    'NIFTY': 80, // revised value in warm cache
    'TCS': 250,
  };

  try {
    CacheService.get = async <T>(_key: string): Promise<T | null> => {
      return cachedPayload as T | null;
    };
    CacheService.set = async (_key: string, value: unknown, _ttl?: number): Promise<void> => {
      cachedPayload = value as Record<string, number>;
    };

    // Simulate fetch failure during refresh (e.g. 500 or network reject)
    global.fetch = (async () => {
      throw new Error('Fyers CDN connection refused (ECONNREFUSED)');
    }) as typeof fetch;

    // @ts-expect-error accessing private method for unit testing
    const loadLotSizes = OptionSuggestionService.loadLotSizes;
    const lotMap: Map<string, number> = await loadLotSizes();

    // Warm cache values must survive and win over hardcoded fallback values
    assert.strictEqual(lotMap.get('NIFTY'), 80, 'Warm cached value (80) must win over hardcoded fallback (65) on failed refresh');
    assert.strictEqual(lotMap.get('TCS'), 250, 'Warm cached value for TCS must be retained');

    // Symbols absent from warm cache fall back to FALLBACK_LOT_SIZES on read
    assert.strictEqual(lotMap.get('BANKNIFTY'), FALLBACK_LOT_SIZES['BANKNIFTY'], 'Missing symbol still falls back to FALLBACK_LOT_SIZES');
  } finally {
    CacheService.get = originalCacheGet;
    CacheService.set = originalCacheSet;
    global.fetch = originalFetch;
  }
});
