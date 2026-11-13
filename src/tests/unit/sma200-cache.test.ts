import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MarketService } from '@/services/market.service';
import { CacheService } from '@/services/cache.service';

describe('MarketService.cache200SMA Chunking & Warning (Task B4)', () => {
  it('chunks symbol universe and processes in batches of SMA200_CHUNK_SIZE', async () => {
    const originalGetUniverse = MarketService.getUniverse;
    const originalFetch = global.fetch;
    const originalCacheSet = CacheService.set;

    const mockSymbols = Array.from({ length: 18 }, (_, i) => ({
      symbol: `SYM${i + 1}`,
      name: `Stock ${i + 1}`,
      sector: 'IT',
      marketCap: 10000,
      isNifty50: false,
      isNifty200: false,
      isFnO: true,
    }));

    MarketService.getUniverse = () => mockSymbols;
    CacheService.set = async () => {};

    const fetchedTickers: string[] = [];
    global.fetch = async (input: string | URL | Request) => {
      const url = input.toString();
      const m = url.match(/\/chart\/([^?]+)/);
      if (m) fetchedTickers.push(m[1]);
      return new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                indicators: {
                  quote: [
                    {
                      close: Array.from({ length: 200 }, () => 100),
                    },
                  ],
                },
              },
            ],
          },
        })
      );
    };

    try {
      const result = await MarketService.cache200SMA('NSE_FNO');
      assert.strictEqual(result.success, 18);
      assert.strictEqual(result.failed, 0);
      assert.strictEqual(fetchedTickers.length, 18);
    } finally {
      MarketService.getUniverse = originalGetUniverse;
      global.fetch = originalFetch;
      CacheService.set = originalCacheSet;
    }
  });

  it('triggers high failure rate warning when failure rate >= SMA200_FAILURE_WARN_THRESHOLD', async () => {
    const originalGetUniverse = MarketService.getUniverse;
    const originalFetch = global.fetch;
    const originalCacheSet = CacheService.set;
    const originalWarn = console.warn;

    const mockSymbols = Array.from({ length: 10 }, (_, i) => ({
      symbol: `SYM${i + 1}`,
      name: `Stock ${i + 1}`,
      sector: 'IT',
      marketCap: 10000,
      isNifty50: false,
      isNifty200: false,
      isFnO: true,
    }));

    MarketService.getUniverse = () => mockSymbols;
    CacheService.set = async () => {};

    let warnMessage = '';
    console.warn = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (msg.includes('200 SMA high failure rate')) {
        warnMessage = msg;
      }
    };

    // First 7 fail (404), remaining 3 succeed -> 70% failure rate >= 20% threshold
    global.fetch = async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes('SYM1.') || url.includes('SYM2.') || url.includes('SYM3.') ||
          url.includes('SYM4.') || url.includes('SYM5.') || url.includes('SYM6.') ||
          url.includes('SYM7.')) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                indicators: {
                  quote: [
                    {
                      close: Array.from({ length: 200 }, () => 100),
                    },
                  ],
                },
              },
            ],
          },
        })
      );
    };

    try {
      const result = await MarketService.cache200SMA('NSE_FNO');
      assert.strictEqual(result.success, 3);
      assert.strictEqual(result.failed, 7);
      assert.ok(warnMessage.includes('200 SMA high failure rate: 7/10 failed (70.0% >= 20% threshold)'));
    } finally {
      MarketService.getUniverse = originalGetUniverse;
      global.fetch = originalFetch;
      CacheService.set = originalCacheSet;
      console.warn = originalWarn;
    }
  });
});
