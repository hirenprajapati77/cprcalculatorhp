import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '@/config/env';
import { _setRedisForTesting } from '../../lib/redis';
import {
  tryAcquireDistributedLock,
  releaseDistributedLock,
  withDistributedLock,
  handleLockContentionWithStaleFallback,
  cleanupDistributedLocksOnProcessExit,
  _resetDistributedLocksForTesting,
  _getHeldLocksForTesting,
} from '../../lib/distributed-lock';

describe('distributed-lock (Tier 1 coverage)', () => {
  beforeEach(() => {
    _resetDistributedLocksForTesting();
  });

  afterEach(() => {
    _resetDistributedLocksForTesting();
  });

  describe('process-local fallback (test/dev)', () => {
    it('acquires and releases lock successfully', async () => {
      const { acquired, token } = await tryAcquireDistributedLock('test:lock:1', 10);
      assert.equal(acquired, true);
      assert.ok(token.length > 0);

      // Second attempt should fail while held
      const second = await tryAcquireDistributedLock('test:lock:1', 10);
      assert.equal(second.acquired, false);

      // Release with correct token
      const released = await releaseDistributedLock('test:lock:1', token);
      assert.equal(released, true);

      // Can acquire again after release
      const third = await tryAcquireDistributedLock('test:lock:1', 10);
      assert.equal(third.acquired, true);
      await releaseDistributedLock('test:lock:1', third.token);
    });

    it('refuses release with incorrect token', async () => {
      const { token } = await tryAcquireDistributedLock('test:lock:mismatch', 10);
      const released = await releaseDistributedLock('test:lock:mismatch', 'wrong-token');
      assert.equal(released, false);

      // Release with empty token
      const emptyRel = await releaseDistributedLock('test:lock:mismatch', '');
      assert.equal(emptyRel, false);

      // Verify heldLocksByProcess still retains token after mismatched release
      assert.equal(_getHeldLocksForTesting().get('test:lock:mismatch'), token);

      const successRel = await releaseDistributedLock('test:lock:mismatch', token);
      assert.equal(successRel, true);
      assert.equal(_getHeldLocksForTesting().has('test:lock:mismatch'), false);
    });

    it('expires expired memory locks automatically', async () => {
      const { token } = await tryAcquireDistributedLock('test:lock:expired', 1);
      assert.ok(token);

      const originalDateNow = Date.now;
      try {
        Date.now = () => originalDateNow() + 5000;
        const reacquired = await tryAcquireDistributedLock('test:lock:expired', 10);
        assert.equal(reacquired.acquired, true);
        await releaseDistributedLock('test:lock:expired', reacquired.token);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('lock release cleanup order (D4-5)', () => {
    afterEach(() => {
      _setRedisForTesting(null);
    });

    it('retains lock in heldLocksByProcess if Redis release throws an error', async () => {
      const mockRedis = {
        status: 'ready',
        set: async () => 'OK',
        eval: async () => {
          throw new Error('Redis connection severed during release');
        },
      } as any;
      _setRedisForTesting(mockRedis);

      const { acquired, token } = await tryAcquireDistributedLock('test:redis:fail', 10);
      assert.equal(acquired, true);
      assert.equal(_getHeldLocksForTesting().get('test:redis:fail'), token);

      // Attempt release which fails in Redis
      const released = await releaseDistributedLock('test:redis:fail', token);
      assert.equal(released, false);

      // D4-5: Process must retain lock in heldLocksByProcess so shutdown hook can attempt cleanup
      assert.equal(_getHeldLocksForTesting().get('test:redis:fail'), token);
    });

    it('removes lock from heldLocksByProcess upon successful Redis release', async () => {
      let currentVal: string | null = null;
      const mockRedis = {
        status: 'ready',
        set: async (_key: string, val: string) => {
          currentVal = val;
          return 'OK';
        },
        eval: async (_script: string, _numKeys: number, _key: string, token: string) => {
          if (currentVal === token) {
            currentVal = null;
            return 1;
          }
          return 0;
        },
      } as any;
      _setRedisForTesting(mockRedis);

      const { acquired, token } = await tryAcquireDistributedLock('test:redis:success', 10);
      assert.equal(acquired, true);
      assert.equal(_getHeldLocksForTesting().get('test:redis:success'), token);

      // Release with wrong token should fail and NOT clear heldLocksByProcess
      const wrongRel = await releaseDistributedLock('test:redis:success', 'wrong-token');
      assert.equal(wrongRel, false);
      assert.equal(_getHeldLocksForTesting().get('test:redis:success'), token);

      // Release with correct token should succeed and remove from heldLocksByProcess
      const correctRel = await releaseDistributedLock('test:redis:success', token);
      assert.equal(correctRel, true);
      assert.equal(_getHeldLocksForTesting().has('test:redis:success'), false);
    });

    it('retains lock in heldLocksByProcess during shutdown cleanup if Redis release fails on both initial attempt and retry (Finding 5)', async () => {
      let evalAttempts = 0;
      const mockRedis = {
        status: 'ready',
        set: async () => 'OK',
        eval: async () => {
          evalAttempts++;
          throw new Error('Redis down during shutdown cleanup');
        },
      } as any;
      _setRedisForTesting(mockRedis);

      const { acquired, token } = await tryAcquireDistributedLock('test:shutdown:fail', 10);
      assert.equal(acquired, true);
      assert.equal(_getHeldLocksForTesting().get('test:shutdown:fail'), token);

      // Execute shutdown cleanup
      await cleanupDistributedLocksOnProcessExit();

      // Must have tried initial attempt + 1 retry = 2 attempts
      assert.equal(evalAttempts, 2, 'Should attempt initial release + 1 retry during shutdown');
      // Failed lock must be retained in heldLocksByProcess
      assert.equal(_getHeldLocksForTesting().get('test:shutdown:fail'), token);
    });

    it('removes lock from heldLocksByProcess during shutdown cleanup if Redis release succeeds on retry (Finding 5)', async () => {
      let evalAttempts = 0;
      let currentVal: string | null = null;
      const mockRedis = {
        status: 'ready',
        set: async (_key: string, val: string) => {
          currentVal = val;
          return 'OK';
        },
        eval: async (_script: string, _numKeys: number, _key: string, token: string) => {
          evalAttempts++;
          if (evalAttempts === 1) {
            // First attempt throws
            throw new Error('Transient network glitch');
          }
          // Retry succeeds
          if (currentVal === token) {
            currentVal = null;
            return 1;
          }
          return 0;
        },
      } as any;
      _setRedisForTesting(mockRedis);

      const { acquired, token } = await tryAcquireDistributedLock('test:shutdown:retry', 10);
      assert.equal(acquired, true);
      assert.equal(_getHeldLocksForTesting().get('test:shutdown:retry'), token);

      // Execute shutdown cleanup
      await cleanupDistributedLocksOnProcessExit();

      assert.equal(evalAttempts, 2, 'Should have retried once after initial failure');
      assert.equal(_getHeldLocksForTesting().has('test:shutdown:retry'), false, 'Should be removed upon successful retry');
    });
  });

  describe('production fail-closed behavior', () => {
    it('fails closed in production when Redis is unavailable', async () => {
      const origEnv = env.NODE_ENV;
      const origProc = process.env.NODE_ENV;
      try {
        (env as { NODE_ENV: string }).NODE_ENV = 'production';
        (process.env as any).NODE_ENV = 'production';

        const res = await tryAcquireDistributedLock('test:prod:lock', 10);
        // In unit tests, Redis is not connected, so in production mode it must fail closed
        assert.equal(res.acquired, false);
        assert.equal(res.token, '');

        const released = await releaseDistributedLock('test:prod:lock', 'some-token');
        assert.equal(released, false);
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = origEnv;
        (process.env as any).NODE_ENV = origProc;
      }
    });
  });

  describe('withDistributedLock helper', () => {
    it('executes taskFn and automatically releases lock', async () => {
      let executed = false;
      const res = await withDistributedLock('test:with:lock', 10, async () => {
        executed = true;
        return 42;
      });

      assert.equal(executed, true);
      assert.equal(res.acquired, true);
      if (res.acquired) {
        assert.equal(res.result, 42);
      }

      // Lock should be released now
      const check = await tryAcquireDistributedLock('test:with:lock', 10);
      assert.equal(check.acquired, true);
      await releaseDistributedLock('test:with:lock', check.token);
    });

    it('reports failure when lock is contested', async () => {
      const { token } = await tryAcquireDistributedLock('test:contested', 10);

      const res = await withDistributedLock('test:contested', 10, async () => 'never');
      assert.equal(res.acquired, false);
      if (!res.acquired) {
        assert.match(res.reason, /held by another process/);
      }

      await releaseDistributedLock('test:contested', token);
    });
  });

  describe('handleLockContentionWithStaleFallback', () => {
    it('returns memory cache report when available', async () => {
      const staleReport = { status: 'stale', data: [1, 2, 3] };
      const res = await handleLockContentionWithStaleFallback({
        cacheKey: 'test:cache:contention',
        getCachedMemory: () => staleReport,
        getPendingReport: () => ({ status: 'pending', data: [] }),
        maxPollSeconds: 0,
      });

      assert.deepEqual(res, staleReport);
    });

    it('returns pending report when memory cache is empty and poll completes', async () => {
      const pendingReport = { status: 'pending', data: [] };
      const res = await handleLockContentionWithStaleFallback({
        cacheKey: 'test:cold:cache',
        getCachedMemory: () => null,
        getPendingReport: () => pendingReport,
        pollIntervalMs: 10,
        maxPollSeconds: 0.05,
      });

      assert.deepEqual(res, pendingReport);
    });
  });

  describe('real contention, multi-instance concurrency, and worker crash simulation', () => {
    afterEach(() => {
      _setRedisForTesting(null);
    });

    it('simulates 3 competing application instances: exactly 1 wins, other 2 fail cleanly', async () => {
      const redisStore: { [key: string]: { token: string; expiresAt: number } } = {};
      const mockRedis = {
        status: 'ready',
        set: async (key: string, token: string, _ex: string, ttlSec: number, nx: string) => {
          assert.equal(nx, 'NX');
          const existing = redisStore[key];
          if (existing && Date.now() < existing.expiresAt) {
            return null; // Key already exists (contention)
          }
          redisStore[key] = { token, expiresAt: Date.now() + ttlSec * 1000 };
          return 'OK';
        },
        eval: async (_script: string, _numKeys: number, key: string, token: string) => {
          const existing = redisStore[key];
          if (existing && existing.token === token) {
            delete redisStore[key];
            return 1;
          }
          return 0;
        },
      } as any;
      _setRedisForTesting(mockRedis);

      // 3 instances attempt to acquire lock concurrently
      const [inst1, inst2, inst3] = await Promise.all([
        tryAcquireDistributedLock('lock:multi:competition', 60),
        tryAcquireDistributedLock('lock:multi:competition', 60),
        tryAcquireDistributedLock('lock:multi:competition', 60),
      ]);

      const acquiredCount = [inst1, inst2, inst3].filter(res => res.acquired).length;
      assert.equal(acquiredCount, 1, 'Exactly one instance must acquire the distributed lock');

      const winner = [inst1, inst2, inst3].find(res => res.acquired)!;
      assert.ok(winner.token.length > 0);

      // Clean release by the winning instance
      const released = await releaseDistributedLock('lock:multi:competition', winner.token);
      assert.equal(released, true);
    });

    it('handles worker crash & TTL expiry: instance 2 acquires after instance 1 crashes, and prevents stale release', async () => {
      let now = 1000000;
      const redisStore: { [key: string]: { token: string; expiresAt: number } } = {};
      const mockRedis = {
        status: 'ready',
        set: async (key: string, token: string, _ex: string, ttlSec: number, _nx: string) => {
          const existing = redisStore[key];
          if (existing && now < existing.expiresAt) {
            return null;
          }
          redisStore[key] = { token, expiresAt: now + ttlSec * 1000 };
          return 'OK';
        },
        eval: async (_script: string, _numKeys: number, key: string, token: string) => {
          const existing = redisStore[key];
          if (existing && existing.token === token) {
            delete redisStore[key];
            return 1;
          }
          return 0;
        },
      } as any;
      _setRedisForTesting(mockRedis);

      // Instance 1 acquires lock with 180s TTL
      const inst1 = await tryAcquireDistributedLock('lock:worker:crash', 180);
      assert.equal(inst1.acquired, true);

      // Instance 2 attempts to acquire lock immediately -> fails
      const inst2Immediate = await tryAcquireDistributedLock('lock:worker:crash', 180);
      assert.equal(inst2Immediate.acquired, false);

      // Worker 1 crashes (simulated by advancing time past 180s without worker 1 calling release)
      now += 185 * 1000; // 185s later

      // Instance 2 now attempts to acquire -> succeeds because lock has expired in Redis
      const inst2AfterExpiry = await tryAcquireDistributedLock('lock:worker:crash', 180);
      assert.equal(inst2AfterExpiry.acquired, true);
      assert.notEqual(inst2AfterExpiry.token, inst1.token);

      // Stale Worker 1 wakes up late and tries to release with its old token -> MUST FAIL (anti-theft)
      const staleReleaseByInst1 = await releaseDistributedLock('lock:worker:crash', inst1.token);
      assert.equal(staleReleaseByInst1, false, 'Stale token from crashed worker 1 must NOT release worker 2 lock');

      // Worker 2's lock is still intact and can be released cleanly by worker 2
      const validReleaseByInst2 = await releaseDistributedLock('lock:worker:crash', inst2AfterExpiry.token);
      assert.equal(validReleaseByInst2, true, 'Valid token from worker 2 must successfully release');
    });
  });
});

