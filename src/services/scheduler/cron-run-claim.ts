import { CacheService } from '@/services/cache.service';

/**
 * Distributed cron-run claim guard using Redis SET NX.
 *
 * Replaces the previous in-memory Set approach that was broken under PM2
 * multi-process deployments: each worker had its own independent in-memory
 * Set, so all workers successfully claimed the same key simultaneously,
 * causing 4× duplicate executions, DB writes, and Telegram alerts.
 *
 * Redis SET NX is atomic across all processes on the same Redis instance.
 * TTL of 90 seconds ensures the lock auto-expires if the job crashes before
 * calling completeCronRun() — preventing permanent lock-out.
 *
 * Falls back to the previous in-memory approach when Redis is unavailable
 * (local dev without Redis, or unit tests).
 */

const LOCK_TTL_SECONDS = 90;

// In-memory fallback (single-process only — used when Redis is down)
const memoryRunning = new Set<string>();
const memoryClaimed = new Set<string>();

function memoryTryClaim(key: string): boolean {
  if (memoryClaimed.has(key) || memoryRunning.has(key)) return false;
  memoryRunning.add(key);
  return true;
}

export async function tryClaimCronRun(key: string): Promise<boolean> {
  // Prefer Redis distributed lock when available
  if (CacheService.isRedisConnected) {
    try {
      // ioredis set() with NX returns 'OK' on success, null if key exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const redis = (CacheService as any)['redisClient'] as import('ioredis').Redis | null;
      if (redis) {
        const result = await redis.set(
          `cron_lock:${key}`,
          '1',
          'EX',
          LOCK_TTL_SECONDS,
          'NX'
        );
        return result === 'OK';
      }
    } catch (err) {
      console.warn('[CronClaim] Redis lock attempt failed, falling back to memory:', err);
    }
  }
  // Fallback: single-process in-memory guard
  return memoryTryClaim(key);
}

export async function completeCronRun(key: string, retainClaim = true): Promise<void> {
  // Remove the running guard from memory fallback
  memoryRunning.delete(key);
  if (retainClaim) memoryClaimed.add(key);

  // Redis lock expires automatically via TTL — no explicit delete needed.
  // If retainClaim=false (job should be allowed to re-run in same minute),
  // delete the Redis key explicitly so the next cron tick can re-acquire.
  if (!retainClaim && CacheService.isRedisConnected) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const redis = (CacheService as any)['redisClient'] as import('ioredis').Redis | null;
      if (redis) await redis.del(`cron_lock:${key}`);
    } catch {
      // non-fatal — lock expires on its own
    }
  }
}

export async function releaseCronRun(key: string): Promise<void> {
  memoryRunning.delete(key);
  if (CacheService.isRedisConnected) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const redis = (CacheService as any)['redisClient'] as import('ioredis').Redis | null;
      if (redis) await redis.del(`cron_lock:${key}`);
    } catch {
      // non-fatal
    }
  }
}

/** Test helper — reset state between unit tests. */
export function resetCronRunClaims(): void {
  memoryClaimed.clear();
  memoryRunning.clear();
}
