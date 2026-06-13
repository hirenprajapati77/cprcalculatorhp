import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

export type CacheProviderType = 'redis' | 'memory' | 'auto';

const CACHE_PROVIDER = (process.env.CACHE_PROVIDER as CacheProviderType) || 'auto';

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

  constructor() {
    this.init();
  }

  private init() {
    if (CACHE_PROVIDER === 'redis' || CACHE_PROVIDER === 'auto') {
      try {
        this.redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          retryStrategy: (times) => {
            if (times > 3) {
              console.warn('Redis unreachable, falling back to memory cache.');
              this.provider = 'memory';
              return null; // Stop retrying
            }
            return Math.min(times * 50, 2000);
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
    if (this.isRedisConnected) {
      try {
        const data = await this.redisClient!.get(key);
        return data ? JSON.parse(data) : null;
      } catch {
        return memoryCache.get(key) as T | null || null;
      }
    }
    return memoryCache.get(key) as T | null || null;
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
    if (this.isRedisConnected) {
      await this.redisClient!.del(key);
    }
    memoryCache.delete(key);
  }

  async clearNamespace(prefix: string): Promise<void> {
    if (this.isRedisConnected) {
      const keys = await this.redisClient!.keys(`${prefix}*`);
      if (keys.length > 0) {
        await this.redisClient!.del(...keys);
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
