import Redis from 'ioredis';

let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true, // Do not block application startup
      connectTimeout: 2000, // Fast timeout
    });
    
    redis.on('error', (err) => {
      // Log silently to avoid flooding console in environment without Redis
      if (process.env.NODE_ENV === 'development') {
        console.warn('Redis connection issue, using memory cache fallback:', err.message);
      }
    });
  } catch (err) {
    console.warn('Failed to initialize Redis client:', err);
  }
}

// In-memory cache fallback implementation
const memoryCache = new Map<string, { value: string; expiry: number }>();

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

  async clear(): Promise<void> {
    if (redis && redis.status === 'ready') {
      try {
        await redis.flushdb();
      } catch (err) {
        console.warn('Redis FLUSHDB failed:', err);
      }
    }
    memoryCache.clear();
  }
};

export default redis;
