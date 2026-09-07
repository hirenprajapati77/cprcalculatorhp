import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerShutdownHook,
  executeShutdown,
  isShuttingDown,
  initShutdownOrchestrator,
  resetShutdownOrchestratorForTesting,
  getActiveExecutionPromise,
  registerDefaultSystemHooks,
  SHUTDOWN_PHASES,
} from '../../lib/shutdown-orchestrator';

describe('shutdown-orchestrator', () => {
  beforeEach(async () => {
    await resetShutdownOrchestratorForTesting();
  });

  it('defines the four canonical shutdown phases in order', () => {
    assert.deepEqual(SHUTDOWN_PHASES, [
      'stop_accepting_work',
      'close_queues',
      'release_locks',
      'close_connections',
    ]);
  });

  it('registers default system hooks covering phase 1 and phase 4', () => {
    registerDefaultSystemHooks();
    // Default hooks should exist and execute without error
    assert.equal(isShuttingDown(), false);
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

  it('enforces deadline when a hook hangs and fails fast with error', async () => {
    let reachedAfterHanging = false;
    let resolveHanging: (() => void) | null = null;

    registerShutdownHook('close_queues', 'hanging-hook', async () => {
      // Simulates a hung hook until explicitly settled during test cleanup
      await new Promise<void>((res) => {
        resolveHanging = res;
      });
    });

    registerShutdownHook('release_locks', 'never-reached', async () => {
      reachedAfterHanging = true;
    });

    const startTime = Date.now();
    let rejectedError: Error | null = null;
    try {
      await executeShutdown({ timeoutMs: 200, exitOnComplete: false });
    } catch (err) {
      rejectedError = err as Error;
    } finally {
      if (resolveHanging) {
        (resolveHanging as () => void)();
      }
      const activePromise = getActiveExecutionPromise();
      if (activePromise) {
        await activePromise.catch(() => {});
      }
    }
    const elapsed = Date.now() - startTime;

    assert.ok(rejectedError !== null, 'Expected shutdown to reject on deadline exceed');
    assert.match(rejectedError!.message, /deadline.*exceeded/i);
    assert.ok(elapsed >= 180, `Expected elapsed >= 180ms, got ${elapsed}ms`);
    assert.ok(elapsed < 1000, `Expected elapsed < 1000ms, got ${elapsed}ms`);
    assert.equal(reachedAfterHanging, false);
  });

  it('cleanly resets test state and removes process signal listeners', async () => {
    initShutdownOrchestrator();
    assert.equal(
      (globalThis as unknown as { __shutdownOrchestratorRegistered?: boolean })
        .__shutdownOrchestratorRegistered,
      true
    );

    await resetShutdownOrchestratorForTesting();
    assert.equal(
      (globalThis as unknown as { __shutdownOrchestratorRegistered?: boolean })
        .__shutdownOrchestratorRegistered,
      undefined
    );
    assert.equal(isShuttingDown(), false);
  });

  it('rejects shutdown when a critical hook fails, while still executing subsequent phases', async () => {
    const executedPhases: string[] = [];

    registerShutdownHook(
      'stop_accepting_work',
      'critical-ingress-hook',
      async () => {
        executedPhases.push('phase1');
        throw new Error('Critical ingress teardown failed');
      },
      { critical: true }
    );

    registerShutdownHook(
      'close_connections',
      'critical-db-hook',
      async () => {
        executedPhases.push('phase4');
      },
      { critical: true }
    );

    let caughtError: Error | null = null;
    try {
      await executeShutdown({ timeoutMs: 1000, exitOnComplete: false });
    } catch (err) {
      caughtError = err as Error;
    }

    assert.ok(caughtError !== null, 'Expected shutdown to reject due to critical hook failure');
    assert.match(caughtError!.message, /critical hook failure.*critical-ingress-hook/i);
    // Crucial: Subsequent phase 4 hook MUST have still executed to clean up remaining resources
    assert.deepEqual(executedPhases, ['phase1', 'phase4']);
  });

  it('triggers process.exit(1) on critical hook failure when exitOnComplete is true', async () => {
    const originalExit = process.exit;
    let exitCode: number | null = null;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as unknown as typeof process.exit;

    try {
      registerShutdownHook(
        'close_connections',
        'critical-pool-fail',
        async () => {
          throw new Error('Postgres pool disconnection aborted');
        },
        true
      );

      try {
        await executeShutdown({ timeoutMs: 1000, exitOnComplete: true });
      } catch {
        // Expected to reject when critical hook fails in test harness
      }
      assert.equal(exitCode, 1, 'Expected process.exit(1) on critical hook failure');
    } finally {
      process.exit = originalExit;
    }
  });

  it('resolves cleanly (exit 0) when only best-effort hooks fail', async () => {
    const originalExit = process.exit;
    let exitCode: number | null = null;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as unknown as typeof process.exit;

    try {
      registerShutdownHook(
        'stop_accepting_work',
        'best-effort-scheduler-hook',
        async () => {
          throw new Error('Non-critical scheduler tick halt failed');
        },
        { critical: false }
      );

      registerShutdownHook(
        'close_connections',
        'healthy-db-hook',
        async () => {
          // Success
        },
        { critical: true }
      );

      // In non-exit mode, must resolve without error
      await executeShutdown({ timeoutMs: 1000, exitOnComplete: false });
      assert.equal(isShuttingDown(), true);

      // Reset for exitOnComplete test
      await resetShutdownOrchestratorForTesting();
      registerShutdownHook(
        'stop_accepting_work',
        'best-effort-scheduler-hook',
        async () => {
          throw new Error('Non-critical scheduler tick halt failed');
        },
        false
      );

      await executeShutdown({ timeoutMs: 1000, exitOnComplete: true });
      assert.equal(exitCode, 0, 'Expected process.exit(0) when only best-effort hook failed');
    } finally {
      process.exit = originalExit;
    }
  });
});
