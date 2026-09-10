import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '@/config/env';
import {
  tryAcquireDistributedLock,
  releaseDistributedLock,
  withDistributedLock,
  handleLockContentionWithStaleFallback,
  _resetDistributedLocksForTesting,
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

      await releaseDistributedLock('test:lock:mismatch', token);
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
});
