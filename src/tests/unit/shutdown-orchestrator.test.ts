import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerShutdownHook,
  executeShutdown,
  isShuttingDown,
  resetShutdownOrchestratorForTesting,
  SHUTDOWN_PHASES,
} from '../../lib/shutdown-orchestrator';

describe('shutdown-orchestrator', () => {
  beforeEach(() => {
    resetShutdownOrchestratorForTesting();
  });

  it('defines the four canonical shutdown phases in order', () => {
    assert.deepEqual(SHUTDOWN_PHASES, [
      'stop_accepting_work',
      'close_queues',
      'release_locks',
      'close_connections',
    ]);
  });

  it('executes registered hooks in strict phase order', async () => {
    const order: string[] = [];

    // Register out of order
    registerShutdownHook('close_connections', 'hook-db', async () => {
      order.push('phase4:close_connections');
    });

    registerShutdownHook('stop_accepting_work', 'hook-ingress', async () => {
      order.push('phase1:stop_accepting_work');
    });

    registerShutdownHook('release_locks', 'hook-cron-locks', async () => {
      order.push('phase3:release_locks');
    });

    registerShutdownHook('close_queues', 'hook-bullmq', async () => {
      order.push('phase2:close_queues');
    });

    assert.equal(isShuttingDown(), false);

    await executeShutdown({ timeoutMs: 1000, exitOnComplete: false });

    assert.equal(isShuttingDown(), true);
    assert.deepEqual(order, [
      'phase1:stop_accepting_work',
      'phase2:close_queues',
      'phase3:release_locks',
      'phase4:close_connections',
    ]);
  });

  it('allows unregistering a hook before shutdown executes', async () => {
    let hookExecuted = false;

    const unregister = registerShutdownHook('close_queues', 'temp-hook', () => {
      hookExecuted = true;
    });

    unregister();

    await executeShutdown({ timeoutMs: 1000, exitOnComplete: false });

    assert.equal(hookExecuted, false);
  });

  it('continues through subsequent phases even if a hook throws', async () => {
    const executed: string[] = [];

    registerShutdownHook('stop_accepting_work', 'failing-hook', async () => {
      executed.push('phase1');
      throw new Error('Simulation of unexpected failure');
    });

    registerShutdownHook('close_queues', 'healthy-queue-hook', async () => {
      executed.push('phase2');
    });

    registerShutdownHook('release_locks', 'healthy-lock-hook', async () => {
      executed.push('phase3');
    });

    await executeShutdown({ timeoutMs: 1000, exitOnComplete: false });

    assert.deepEqual(executed, ['phase1', 'phase2', 'phase3']);
  });

  it('is idempotent — concurrent or duplicate calls share the same execution', async () => {
    let callCount = 0;

    registerShutdownHook('close_queues', 'counter-hook', async () => {
      callCount++;
    });

    const [p1, p2, p3] = [
      executeShutdown({ timeoutMs: 1000, exitOnComplete: false }),
      executeShutdown({ timeoutMs: 1000, exitOnComplete: false }),
      executeShutdown({ timeoutMs: 1000, exitOnComplete: false }),
    ];

    await Promise.all([p1, p2, p3]);

    assert.equal(callCount, 1);
  });

  it('enforces deadline when a hook hangs', async () => {
    let reachedAfterHanging = false;

    registerShutdownHook('close_queues', 'hanging-hook', async () => {
      // Intentionally never resolves
      await new Promise(() => {});
    });

    registerShutdownHook('release_locks', 'never-reached', async () => {
      reachedAfterHanging = true;
    });

    const startTime = Date.now();
    // Use a short 200ms timeout for test speed
    await executeShutdown({ timeoutMs: 200, exitOnComplete: false });
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed >= 180, `Expected elapsed >= 180ms, got ${elapsed}ms`);
    assert.ok(elapsed < 1000, `Expected elapsed < 1000ms, got ${elapsed}ms`);
    assert.equal(reachedAfterHanging, false);
  });
});
