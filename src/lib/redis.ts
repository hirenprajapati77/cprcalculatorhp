import { env } from '@/config/env';
import Redis from 'ioredis';

let redis: Redis | null = null;

if (env.REDIS_URL) {
  try {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true, // Do not block application startup
      connectTimeout: 2000, // Fast timeout
    });
    
    let lastErrorLogTime = 0;
    const ERROR_LOG_THROTTLE_MS = 60000; // Log at most once per minute

    redis.on('error', (err) => {
      // Log silently to avoid flooding console in environment without Redis
      const now = Date.now();
      if (now - lastErrorLogTime > ERROR_LOG_THROTTLE_MS) {
        if (env.NODE_ENV === 'development') {
          console.warn('Redis connection issue, using memory cache fallback:', err.message);
        }
        lastErrorLogTime = now;
      }
    });

    redis.connect().catch((err) => {
      console.warn('Redis initial connection failed, will use memory cache fallback:', err.message);
    });
  } catch (err) {
    console.warn('Failed to initialize Redis client:', err);
  }
} else {
  if (env.NODE_ENV === 'production') {
    console.warn('WARNING: REDIS_URL is not set in production. Rate limiting and caching will fall back to an in-memory map which is NOT shared across multiple workers or instances!');
  }
}

// In-memory cache fallback implementation
const memoryCache = new Map<string, { value: string; expiry: number }>();

/**
 * Actively sweeps expired entries from the in-memory cache to prevent unbounded growth.
 * Returns the count of purged keys.
 */
export function sweepExpiredMemoryCache(now: number = Date.now()): number {
  let purged = 0;
  for (const [key, cached] of memoryCache.entries()) {
    if (now > cached.expiry) {
      memoryCache.delete(key);
      purged++;
    }
  }
  return purged;
}

// Background sweep timer runs every 60s. .unref() ensures it does not block process exit.
const sweepTimer = setInterval(() => {
  sweepExpiredMemoryCache();
}, 60_000);
if (sweepTimer.unref) {
  sweepTimer.unref();
}

export const cache = {
  async get(key: string): Promise<string | null> {
    if (redis && redis.status === 'ready') {
      try {
        return await redis.get(key);
      } catch (err) {
        console.warn('Redis GET failed, falling back to memory cache:', err);
      }
    }
    const cached = memoryCache.get(key);
    if (cached) {
      if (cached.expiry > Date.now()) {
        return cached.value;
      }
      memoryCache.delete(key); // Evict expired key
    }
    return null;
  },

  async set(key: string, value: string, ttlSeconds: number = 300): Promise<void> {
    if (redis && redis.status === 'ready') {
      try {
        await redis.set(key, value, 'EX', ttlSeconds);
        return;
      } catch (err) {
        console.warn('Redis SET failed, falling back to memory cache:', err);
      }
    }
    memoryCache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  },

  async setNX(key: string, value: string, ttlSeconds: number = 120): Promise<boolean> {
    if (redis && redis.status === 'ready') {
      try {
        const res = await redis.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch (err) {
        console.warn('Redis SETNX failed, falling back to memory cache:', err);
      }
    }
    const cached = memoryCache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return false;
    }
    memoryCache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
    return true;
  },

  async del(key: string): Promise<void> {
    if (redis && redis.status === 'ready') {
      try {
        await redis.del(key);
        return;
      } catch (err) {
        console.warn('Redis DEL failed, falling back to memory cache:', err);
      }
    }
    memoryCache.delete(key);
  },

  async delPattern(pattern: string): Promise<void> {
    if (redis && redis.status === 'ready') {
      try {
        let cursor = '0';
        do {
          const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = reply[0];
          const keys = reply[1];
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== '0');
        return;
      } catch (err) {
        console.warn('Redis delPattern failed, falling back to memory cache:', err);
      }
    }
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );

    for (const key of Array.from(memoryCache.keys())) {
      if (regex.test(key)) {
        memoryCache.delete(key);
      }
    }
  },

  async clear(): Promise<void> {
    if (redis && redis.status === 'ready') {
      try {
        await redis.flushdb();
      } catch (err) {
        console.warn('Redis FLUSHDB failed:', err);
      }
    }
    memoryCache.clear();
  },
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (redis && redis.status === 'ready') {
      try {
        const pipeline = redis.multi();
        pipeline.incr(key);
        pipeline.expire(key, ttlSeconds, 'NX'); // sets TTL only if not already set
        const results = await pipeline.exec();
        const count = results?.[0]?.[1] as number ?? 1;
        return count;
      } catch (err) {
        console.warn('Redis INCR failed, falling back to memory cache:', err);
      }
    }

    // Memory fallback logic
    const now = Date.now();
    const cached = memoryCache.get(key);
    if (!cached || now > cached.expiry) {
      const countVal = 1;
      memoryCache.set(key, { value: String(countVal), expiry: now + ttlSeconds * 1000 });
      return countVal;
    }
    const countVal = parseInt(cached.value, 10) + 1;
    memoryCache.set(key, { value: String(countVal), expiry: cached.expiry });
    return countVal;
  }
};

export default redis;
