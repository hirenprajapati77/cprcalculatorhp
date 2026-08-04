import { CacheService } from '@/services/cache.service';

/**
 * Distributed cron-run claim guard using Redis SET NX.
 *
 * Replaces the previous in-memory Set approach that was broken under PM2
 * multi-process deployments: each worker had its own independent in-memory
 * Set, so all workers successfully claimed the same key simultaneously,
 * causing 4× duplicate executions, DB writes, and Telegram alerts.
 *
 * Two Redis keys per claim:
 *   cron_lock:{key}  — short-lived running lock (TTL 90s). Auto-expires if the
 *                      job crashes before complete/release.
 *   cron_done:{key}  — retainClaim marker (TTL 24h). Written on successful
 *                      complete(retainClaim=true) so other workers cannot
 *                      re-claim after the running lock expires.
 *
 * Falls back to the previous in-memory approach when Redis is unavailable
 * (local dev without Redis, or unit tests).
 */

const LOCK_TTL_SECONDS = 90;
/** How long a completed retainClaim stays blocked across workers. */
const DONE_TTL_SECONDS = 24 * 60 * 60;

// In-memory fallback (single-process only — used when Redis is down)
const memoryRunning = new Set<string>();
const memoryClaimed = new Set<string>();

function memoryTryClaim(key: string): boolean {
  if (memoryClaimed.has(key) || memoryRunning.has(key)) return false;
  memoryRunning.add(key);
  return true;
}

function getRedis(): import('ioredis').Redis | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (CacheService as any)['redisClient'] as import('ioredis').Redis | null;
}

export async function tryClaimCronRun(key: string): Promise<boolean> {
  if (CacheService.isRedisConnected) {
    try {
      const redis = getRedis();
      if (redis) {
        // Already completed today/bucket — do not re-run.
        const done = await redis.get(`cron_done:${key}`);
        if (done) return false;

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
  return memoryTryClaim(key);
}

export async function completeCronRun(key: string, retainClaim = true): Promise<void> {
  memoryRunning.delete(key);
  if (retainClaim) memoryClaimed.add(key);

  if (!CacheService.isRedisConnected) return;

  try {
    const redis = getRedis();
    if (!redis) return;

    if (retainClaim) {
      // Persist completion across workers for the rest of the trading day.
      await redis.set(`cron_done:${key}`, '1', 'EX', DONE_TTL_SECONDS);
    }
    // Drop the short running lock either way.
    await redis.del(`cron_lock:${key}`);
  } catch {
    // non-fatal — lock expires on its own
  }
}

export async function releaseCronRun(key: string): Promise<void> {
  memoryRunning.delete(key);
  if (CacheService.isRedisConnected) {
    try {
      const redis = getRedis();
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
