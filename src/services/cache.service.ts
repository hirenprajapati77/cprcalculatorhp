import { cache } from '@/lib/redis';

export class CacheService {
  /**
   * Retrieves parsed JSON data from the cache using a scanner-specific key prefix.
   */
  static async getScannerCache<T>(key: string): Promise<T | null> {
    const data = await cache.get(`scanner:data:${key}`);
    if (data) {
      try {
        return JSON.parse(data) as T;
      } catch (err) {
        console.error('Failed to parse scanner cache payload:', err);
      }
    }
    return null;
  }

  /**
   * Caches raw objects under a scanner-specific prefix. Default TTL is 5 minutes (300 seconds).
   */
  static async setScannerCache(key: string, data: unknown, ttlSeconds: number = 300): Promise<void> {
    await cache.set(`scanner:data:${key}`, JSON.stringify(data), ttlSeconds);
  }

  /**
   * Evicts scanner-related keys from the cache.
   */
  static async clearScannerCache(): Promise<void> {
    await cache.clear();
  }
}
