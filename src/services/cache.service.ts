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
  return nodeEnv === 'production' || Boolean(redisUrl);
}

// LRU Memory Cache fallback
const memoryCache = new LRUCache<string, NonNullable<unknown>>({
  max: 1000, // max keys to prevent memory leak
  ttl: 1000 * 60 * 60, // max 1 hour default TTL
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
    if (CACHE_PROVIDER === 'redis' || CACHE_PROVIDER === 'auto') {
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
    let result: T | null = null;
    
    if (this.isRedisConnected) {
      try {
        const data = await this.redisClient!.get(key);
        result = data ? JSON.parse(data) : null;
      } catch {
        result = memoryCache.get(key) as T | null ?? null;
      }
    } else {
      result = memoryCache.get(key) as T | null ?? null;
    }

    if (result !== null) {
      this.hits++;
    } else {
      this.misses++;
    }
    
    return result;
  }

  async set(key: string, value: NonNullable<unknown>, ttlSeconds: number): Promise<void> {
    if (this.isRedisConnected) {
      try {
        await this.redisClient!.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch {
        // fallback
      }
    }
    memoryCache.set(key, value, { ttl: ttlSeconds * 1000 });
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
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redisClient!.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redisClient!.del(...keys);
        }
      } while (cursor !== '0');
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
