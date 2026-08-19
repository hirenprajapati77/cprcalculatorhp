import { env } from '@/config/env';
import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

export type CacheProviderType = 'redis' | 'memory' | 'auto';

const CACHE_PROVIDER = (env.CACHE_PROVIDER as CacheProviderType) || 'auto';
const REDIS_FALLBACK_AFTER_RETRIES = 3;
const REDIS_RECONNECT_MAX_DELAY_MS = 30_000;

export function getRedisReconnectDelay(times: number): number {
  return Math.min(Math.max(times, 1) * 1000, REDIS_RECONNECT_MAX_DELAY_MS);
}

export function shouldKeepRedisRetrying(nodeEnv: string, redisUrl?: string): boolean {
  // Never pin the event loop during unit tests — a down Redis + open reconnect
  // timer prevents `node --test` from exiting.
  if (nodeEnv === 'test') return false;
  return nodeEnv === 'production' || Boolean(redisUrl);
}

/** Per-universe auto-scan cache key — avoids NIFTY_FNO / ALL_NSE collisions. */
export function autoScanResultCacheKey(
  universe: string,
  market: string = 'NSE'
): string {
  return `AUTO_SCAN_RESULT:${universe}:${market}`;
}

/**
 * In-process LRU — Redis-down fallback only (max 200 keys).
 *
 * INTENTIONAL TRADE-OFF (Oracle ~1 GB VM, PR #89):
 * When Redis is connected, CacheService.set() writes Redis ONLY and does NOT
 * mirror into this L1. That reverses the earlier "always write L1" warm-cache
 * fix, which duplicated ~700 market/scanner keys in Node heap and pushed host
 * RAM toward 90%.
 *
 * Accepted failure mode under mem_watchdog (flush Redis at 75% RAM):
 * both Redis and L1 are cold → next request batch miss-storms DB/upstream.
 * We accept that burst because permanent 2× cache residency is worse on this
 * RAM budget than a transient miss spike after a flush/restart.
 *
 * Do NOT reintroduce always-write L1 without revisiting VM size or reducing
 * the Redis key footprint first. See AGENTS.md → Memory.
 */
const MEMORY_CACHE_MAX = 200;

const memoryCache = new LRUCache<string, NonNullable<unknown>>({
  max: MEMORY_CACHE_MAX,
  ttl: 1000 * 60 * 60,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

class CacheServiceImpl {
  private redisClient: Redis | null = null;
  private provider: 'redis' | 'memory' = 'memory';
  private redisFallbackLogged = false;

  // Metrics tracking
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor() {
    this.init();
  }

  private init() {
    // auto without REDIS_URL must not invent localhost — that spams reconnects
    // locally and keeps the Node event loop alive after tests finish.
    const shouldUseRedis =
      CACHE_PROVIDER === 'redis' || (CACHE_PROVIDER === 'auto' && Boolean(env.REDIS_URL));

    if (shouldUseRedis) {
      try {
        this.redisClient = new Redis(env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          retryStrategy: (times) => {
            const delay = getRedisReconnectDelay(times);
            if (times > REDIS_FALLBACK_AFTER_RETRIES) {
              const keepRetrying = shouldKeepRedisRetrying(env.NODE_ENV, env.REDIS_URL);
              if (!this.redisFallbackLogged) {
                const message = keepRetrying
                  ? `Redis unreachable, using memory cache while retrying every ${delay}ms.`
                  : 'Redis unreachable, using memory cache.';
                console.warn(message);
                this.redisFallbackLogged = true;
              }
              this.provider = 'memory';
              if (!keepRetrying) {
                // Drop the client so reconnect timers don't block process exit.
                try {
                  this.redisClient?.disconnect();
                } catch {
                  // ignore
                }
                this.redisClient = null;
                return null;
              }
            }
            return delay;
          },
        });

        this.redisClient.on('error', (err) => {
          console.error('Redis error:', err);
          if (CACHE_PROVIDER === 'auto') {
            this.provider = 'memory';
          }
        });

        this.redisClient.on('ready', () => {
          console.log('Redis connected');
          this.redisFallbackLogged = false;
          this.provider = 'redis';
          // C4/M4 fix: flush stale L1 entries that accumulated during the outage.
          // After Redis reconnects, set() writes Redis-only; if L1 has old values
          // from the downtime they would be returned by get() on a Redis eviction,
          // potentially delivering stale prices to Telegram alerts.
          memoryCache.clear();
          console.log('[Cache] L1 memoryCache cleared on Redis reconnect — stale data purged.');
        });
      } catch {
        console.error('Failed to initialize Redis, using memory cache.');
        this.provider = 'memory';
      }
    } else {
      this.provider = 'memory';
    }
  }

  get isRedisConnected() {
    return this.provider === 'redis' && this.redisClient?.status === 'ready';
  }

  getProvider() {
    return this.provider;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.isRedisConnected) {
      try {
        const data = await this.redisClient!.get(key);
        if (data) {
          this.hits++;
          return JSON.parse(data) as T;
        }
        // C4 fix: Redis returned null = genuine key miss. Do NOT fall back to L1.
        // Returning stale L1 data here is worse than a cache miss because it can
        // deliver wrong LTP/entry/SL to Telegram alerts after mem_watchdog evictions.
        // L1 is only trusted when Redis is genuinely unreachable (error path below).
        this.misses++;
        return null;
      } catch {
        // Redis threw (network error, timeout, etc.) — fall through to L1 ONLY
        // because Redis is genuinely unavailable, not just missing the key.
        // C-1 fix: structuredClone(undefined) throws DataCloneError; guard before clone.
        const l1Raw = memoryCache.get(key) as T | undefined;
        const l1 = l1Raw !== undefined ? structuredClone(l1Raw) : null;
        if (l1 !== null) {
          this.hits++;
        } else {
          this.misses++;
        }
        return l1;
      }
    }

    // Memory-only path
    // C-1 fix: structuredClone(undefined) throws DataCloneError; guard before clone.
    const resultRaw = memoryCache.get(key) as T | undefined;
    const result = resultRaw !== undefined ? structuredClone(resultRaw) : null;
    if (result !== null) {
      this.hits++;
    } else {
      this.misses++;
    }
    return result;
  }

  async set(key: string, value: NonNullable<unknown>, ttlSeconds: number): Promise<void> {
    // Redis-connected path: Redis only (no L1 mirror). See MEMORY_CACHE_MAX trade-off.
    if (this.isRedisConnected) {
      try {
        await this.redisClient!.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch {
        // Redis write failed — fall through to memory fallback below.
      }
    }

    memoryCache.set(key, structuredClone(value), { ttl: ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.evictions++;
    if (this.isRedisConnected) {
      await this.redisClient!.del(key);
    }
    memoryCache.delete(key);
  }

  async clearNamespace(prefix: string): Promise<void> {
    this.evictions++;
    if (this.isRedisConnected) {
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.redisClient!.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            await this.redisClient!.del(...keys);
          }
        } while (cursor !== '0');
      } catch (err) {
        console.error(`[Cache] Failed to clear Redis namespace for ${prefix}:`, err);
      }
    }
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    }
  }

  getMemoryUsage() {
    return {
      size: memoryCache.size,
      max: memoryCache.max,
    };
  }

  /**
   * M4 fix: Expose explicit L1 purge for post-cron memory management.
   * Call this via purgeInProcessCaches() after heavy overnight crons to
   * enforce strict Node.js heap limits on the 1 GB Oracle VM.
   */
  clearL1(): void {
    memoryCache.clear();
    console.log('[Cache] L1 memoryCache explicitly cleared.');
  }

  async getMetrics() {
    const total = this.hits + this.misses;
    let keysCount = memoryCache.size;
    if (this.isRedisConnected) {
      try {
        keysCount = await this.redisClient!.dbsize();
      } catch {
        // ignore
      }
    }

    return {
      provider: this.provider,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      keys: keysCount
    };
  }
}

export const CacheService = new CacheServiceImpl();

// Namespace formatters
export const CacheKeys = {
  market: (symbol: string) => `market:${symbol}`,
  scanner: (universe: string, filtersHash: string) => `scanner:${universe}:${filtersHash}`,
  heatmap: (universe: string) => `heatmap:${universe}`,
  history: (user: string, cursor: string) => `history:${user}:${cursor}`,
  health: 'health:summary'
};
