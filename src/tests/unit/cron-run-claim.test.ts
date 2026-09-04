import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  tryClaimCronRun,
  completeCronRun,
  releaseCronRun,
  resetCronRunClaims,
} from '../../services/scheduler/cron-run-claim';
import { CacheService } from '../../services/cache.service';

describe('cron-run-claim service', () => {
  beforeEach(() => {
    resetCronRunClaims();
  });

  it('claims an idle key and prevents concurrent claim on same key', async () => {
    const claim1 = await tryClaimCronRun('test-job-1');
    assert.equal(claim1, true);

    const claim2 = await tryClaimCronRun('test-job-1');
    assert.equal(claim2, false);
  });

  it('allows claiming different keys simultaneously', async () => {
    const claim1 = await tryClaimCronRun('job-a');
    const claim2 = await tryClaimCronRun('job-b');
    assert.equal(claim1, true);
    assert.equal(claim2, true);
  });

  it('releasing a claim allows re-claiming immediately', async () => {
    const claim1 = await tryClaimCronRun('job-release');
    assert.equal(claim1, true);

    await releaseCronRun('job-release');

    const claim2 = await tryClaimCronRun('job-release');
    assert.equal(claim2, true);
  });

  it('completing with retainClaim=true blocks subsequent claims', async () => {
    const claim1 = await tryClaimCronRun('job-complete-retain');
    assert.equal(claim1, true);

    await completeCronRun('job-complete-retain', true);

    const claim2 = await tryClaimCronRun('job-complete-retain');
    assert.equal(claim2, false);
  });

  it('completing with retainClaim=false allows subsequent claims', async () => {
    const claim1 = await tryClaimCronRun('job-complete-no-retain');
    assert.equal(claim1, true);

    await completeCronRun('job-complete-no-retain', false);

    const claim2 = await tryClaimCronRun('job-complete-no-retain');
    assert.equal(claim2, true);
  });

  it('releases lock using owner token via simulated redis eval', async () => {
    const origDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(CacheService), 'isRedisConnected');
    const originalRedisClient = (CacheService as any).redisClient;

    const evalCalledWith: any[] = [];
    const mockRedis = {
      status: 'ready',
      get: async (_key: string) => null,
      set: async (_key: string, _val: string, _mode?: string, _ttl?: number, _flag?: string) => 'OK',
      eval: async (script: string, numkeys: number, key: string, token: string) => {
        evalCalledWith.push({ script, numkeys, key, token });
        return 1;
      },
      del: async (_key: string) => 1,
    };

    try {
      Object.defineProperty(CacheService, 'isRedisConnected', { value: true, configurable: true });
      (CacheService as any).redisClient = mockRedis;

      const claimed = await tryClaimCronRun('redis-token-job');
      assert.equal(claimed, true);

      await releaseCronRun('redis-token-job');

      assert.equal(evalCalledWith.length, 1);
      assert.equal(evalCalledWith[0].key, 'cron_lock:redis-token-job');
      assert.match(evalCalledWith[0].token, /^\d+:\d+:[a-z0-9]+$/);
    } finally {
      if (origDesc) {
        Object.defineProperty(Object.getPrototypeOf(CacheService), 'isRedisConnected', origDesc);
      }
      delete (CacheService as any).isRedisConnected;
      (CacheService as any).redisClient = originalRedisClient;
    }
  });
});
