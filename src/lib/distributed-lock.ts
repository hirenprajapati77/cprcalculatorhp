import crypto from 'node:crypto';
import redis, { isRedisAvailable, cache } from '@/lib/redis';
import { env } from '@/config/env';
import { registerShutdownHook } from '@/lib/shutdown-orchestrator';

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// In-memory fallback map for test/local environments or Redis downtime
// In production, this provides process-local synchronization only, NOT distributed protection.
const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

/** Active locks held by this process for graceful shutdown cleanup */
const heldLocksByProcess = new Map<string, string>(); // lockKey -> token

let lastDegradedLogTime = 0;
const DEGRADED_LOG_INTERVAL_MS = 60_000;

function sweepExpiredMemoryLocks(now = Date.now()): void {
  for (const [key, lock] of memoryLocks.entries()) {
    if (now >= lock.expiresAt) {
      memoryLocks.delete(key);
    }
  }
}

/**
 * Acquire a distributed lock with an owner token and TTL.
 * Uses Redis `SET key token EX ttlSeconds NX`.
 * When Redis is unavailable, degrades to process-local locking with an explicit warning in production.
 */
export async function tryAcquireDistributedLock(
  key: string,
  ttlSeconds = 180
): Promise<{ acquired: boolean; token: string }> {
  const token = crypto.randomUUID();

  if (isRedisAvailable() && redis) {
    try {
      const res = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
      if (res === 'OK') {
        heldLocksByProcess.set(key, token);
        return { acquired: true, token };
      }
      return { acquired: false, token: '' };
    } catch (err) {
      console.warn('[DistributedLock] Redis error during lock acquire:', err);
    }
  }

  // Fail closed in production when Redis is unavailable to prevent concurrent multi-worker execution
  const isProduction = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProduction) {
    const now = Date.now();
    if (now - lastDegradedLogTime > DEGRADED_LOG_INTERVAL_MS) {
      console.error(
        '[DistributedLock] FAIL-CLOSED: Redis is unavailable in production. ' +
        'Refusing to acquire lock to prevent concurrent multi-worker execution and DB overload.'
      );
      lastDegradedLogTime = now;
    }
    return { acquired: false, token: '' };
  }

  // Non-production process-local fallback (dev/test only)
  sweepExpiredMemoryLocks();
  const existing = memoryLocks.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    return { acquired: false, token: '' };
  }

  memoryLocks.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
  heldLocksByProcess.set(key, token);
  return { acquired: true, token };
}

/**
 * Release a distributed lock atomically using Lua script.
 * Verifies the caller's ownership token to prevent releasing another worker's lock.
 */
export async function releaseDistributedLock(
  key: string,
  token: string
): Promise<boolean> {
  if (!token) return false;
  heldLocksByProcess.delete(key);

  if (isRedisAvailable() && redis) {
    try {
      const res = await redis.eval(RELEASE_LOCK_LUA, 1, key, token);
      return res === 1;
    } catch (err) {
      console.warn('[DistributedLock] Redis error during lock release:', err);
    }
  }

  const isProduction = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProduction) {
    // In production, locks are strictly managed via Redis. Process-local fallback is disabled.
    return false;
  }

  // Process-local fallback release (dev/test only)
  sweepExpiredMemoryLocks();
  const existing = memoryLocks.get(key);
  if (existing && existing.token === token) {
    memoryLocks.delete(key);
    return true;
  }
  return false;
}

/**
 * Execute taskFn within a distributed lock. Automatically releases in finally block.
 */
export async function withDistributedLock<T>(
  key: string,
  ttlSeconds: number,
  taskFn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false; reason: string }> {
  const { acquired, token } = await tryAcquireDistributedLock(key, ttlSeconds);
  if (!acquired) {
    return { acquired: false, reason: `Lock for ${key} is held by another process` };
  }

  try {
    const result = await taskFn();
    return { acquired: true, result };
  } finally {
    await releaseDistributedLock(key, token);
  }
}

/**
 * Handles lock contention according to the approved ISSUE-002 stale-cache contract:
 * 1. Checks if Redis or memory has an existing cached report -> returns it immediately (stale-cache serving).
 * 2. If cache is cold, polls Redis up to maxPollSeconds (default 10s) awaiting in-flight compute to write.
 * 3. If still cold after polling, returns deterministic pending report.
 */
export async function handleLockContentionWithStaleFallback<T>(options: {
  cacheKey: string;
  getCachedMemory: () => T | null;
  getPendingReport: () => T;
  pollIntervalMs?: number;
  maxPollSeconds?: number;
}): Promise<T> {
  const {
    cacheKey,
    getCachedMemory,
    getPendingReport,
    pollIntervalMs = 1000,
    maxPollSeconds = 10,
  } = options;

  // 1. Stale-cache serving: return existing cached report immediately
  try {
    const redisCached = await cache.get(cacheKey);
    if (redisCached) {
      return JSON.parse(redisCached) as T;
    }
  } catch {
    // Non-critical cache read error
  }
  const mem = getCachedMemory();
  if (mem) return mem;

  // 2. Cold cache: poll Redis up to maxPollSeconds
  const attempts = Math.floor((maxPollSeconds * 1000) / pollIntervalMs);
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    try {
      const redisCached = await cache.get(cacheKey);
      if (redisCached) {
        return JSON.parse(redisCached) as T;
      }
    } catch {
      // Non-critical poll error
    }
    const memPoll = getCachedMemory();
    if (memPoll) return memPoll;
  }

  // 3. Fallback to pending state
  return getPendingReport();
}

/**
 * Test-only reset helper to clear all in-memory lock state.
 */
export function _resetDistributedLocksForTesting(): void {
  memoryLocks.clear();
  heldLocksByProcess.clear();
}

/**
 * Register process exit hook to clean up active locks held by this process.
 */
registerShutdownHook('release_locks', 'market_tools_distributed_locks', async () => {
  if (heldLocksByProcess.size === 0) return;
  const entries = Array.from(heldLocksByProcess.entries());
  heldLocksByProcess.clear();

  for (const [key, token] of entries) {
    try {
      await releaseDistributedLock(key, token);
    } catch {
      // Best-effort cleanup on exit
    }
  }
}, { critical: false });
