import { CacheService } from '@/services/cache.service';
import { registerShutdownHook } from '@/lib/shutdown-orchestrator';

/**
 * Distributed cron-run claim guard using Redis SET NX.
 *
 * Replaces the previous in-memory Set approach that was broken under PM2
 * multi-process deployments: each worker had its own independent in-memory
 * Set, so all workers successfully claimed the same key simultaneously,
 * causing 4× duplicate executions, DB writes, and Telegram alerts.
 *
 * Two Redis keys per claim:
 *   cron_lock:{key}  — short-lived running lock (TTL 10m). Auto-expires if the
 *                      job crashes before complete/release. Must exceed worst-case
 *                      full F&O auto-scan so a 60s scheduler tick cannot re-claim.
 *   cron_done:{key}  — retainClaim marker (TTL 24h). Written on successful
 *                      complete(retainClaim=true) so other workers cannot
 *                      re-claim after the running lock expires.
 *
 * Falls back to the previous in-memory approach when Redis is unavailable
 * (local dev without Redis, or unit tests).
 */

const LOCK_TTL_SECONDS = 600;
/** How long a completed retainClaim stays blocked across workers. */
const DONE_TTL_SECONDS = 24 * 60 * 60;

// In-memory fallback (single-process only — used when Redis is down)
const memoryRunning = new Set<string>();
// M-5 fix: use a Map<key, expiresAtMs> instead of a permanent Set so that
// retainClaim entries expire after DONE_TTL_SECONDS (matching Redis behaviour).
// Previously, memoryClaimed was a plain Set that never expired, permanently
// locking date-free cron keys across midnight without a process restart.
const memoryClaimed = new Map<string, number>(); // key → expiresAt (ms)
/** Active running lock keys tracked for process exit cleanup */
const activeRunningLocks = new Set<string>();
/** Owner token per claimed key to prevent deleting locks acquired by others */
const activeLockTokens = new Map<string, string>();

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// H-16 fix: sweep expired entries from memoryClaimed to prevent date-stamped keys leaking heap
function evictExpiredMemoryClaims(): void {
  const now = Date.now();
  for (const [k, expiresAt] of memoryClaimed.entries()) {
    if (now >= expiresAt) {
      memoryClaimed.delete(k);
    }
  }
}

export async function cleanupLocksOnProcessExit(): Promise<void> {
  if (activeRunningLocks.size === 0) return;
  const entries = Array.from(activeRunningLocks).map((k) => ({
    key: k,
    token: activeLockTokens.get(k),
  }));
  activeRunningLocks.clear();
  activeLockTokens.clear();
  try {
    const redis = getRedis();
    if (redis && CacheService.isRedisConnected) {
      for (const { key, token } of entries) {
        if (token) {
          await redis.eval(RELEASE_LOCK_LUA, 1, `cron_lock:${key}`, token);
        } else {
          await redis.del(`cron_lock:${key}`);
        }
      }
      console.log(`[CronClaim] Released ${entries.length} orphaned cron lock(s) on process exit.`);
    }
  } catch (err) {
    console.warn('[CronClaim] Failed to release cron locks on exit:', err);
  }
}

registerShutdownHook('release_locks', 'cron-distributed-locks', async () => {
  await cleanupLocksOnProcessExit();
});

function memoryTryClaim(key: string): boolean {
  evictExpiredMemoryClaims();
  const claimedUntil = memoryClaimed.get(key);
  if (claimedUntil !== undefined) {
    if (Date.now() < claimedUntil) return false; // still within TTL
    memoryClaimed.delete(key); // expired — allow re-claim
  }
  if (memoryRunning.has(key)) return false;
  memoryRunning.add(key);
  activeRunningLocks.add(key);
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

        // H-15 fix: store unique owner token instead of static '1'
        const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const result = await redis.set(
          `cron_lock:${key}`,
          token,
          'EX',
          LOCK_TTL_SECONDS,
          'NX'
        );
        if (result === 'OK') {
          activeRunningLocks.add(key);
          activeLockTokens.set(key, token);
          return true;
        }
        return false;
      }
    } catch (err) {
      console.warn('[CronClaim] Redis lock attempt failed, falling back to memory:', err);
    }
  }
  return memoryTryClaim(key);
}

export async function completeCronRun(key: string, retainClaim = true): Promise<void> {
  memoryRunning.delete(key);
  activeRunningLocks.delete(key);
  const token = activeLockTokens.get(key);
  activeLockTokens.delete(key);

  evictExpiredMemoryClaims();
  if (retainClaim) memoryClaimed.set(key, Date.now() + DONE_TTL_SECONDS * 1000);

  if (!CacheService.isRedisConnected) return;

  try {
    const redis = getRedis();
    if (!redis) return;

    if (retainClaim) {
      // Persist completion across workers for the rest of the trading day.
      await redis.set(`cron_done:${key}`, '1', 'EX', DONE_TTL_SECONDS);
    }
    // H-15 fix: drop lock using owner token check so we never delete a lock acquired by another run
    if (token) {
      await redis.eval(RELEASE_LOCK_LUA, 1, `cron_lock:${key}`, token);
    } else {
      await redis.del(`cron_lock:${key}`);
    }
  } catch {
    // non-fatal — lock expires on its own
  }
}

export async function releaseCronRun(key: string): Promise<void> {
  memoryRunning.delete(key);
  activeRunningLocks.delete(key);
  const token = activeLockTokens.get(key);
  activeLockTokens.delete(key);

  if (CacheService.isRedisConnected) {
    try {
      const redis = getRedis();
      if (redis) {
        if (token) {
          await redis.eval(RELEASE_LOCK_LUA, 1, `cron_lock:${key}`, token);
        } else {
          await redis.del(`cron_lock:${key}`);
        }
      }
    } catch {
      // non-fatal
    }
  }
}

/** Test helper — reset state between unit tests. */
export function resetCronRunClaims(): void {
  memoryClaimed.clear();
  memoryRunning.clear();
  activeRunningLocks.clear();
  activeLockTokens.clear();
}
