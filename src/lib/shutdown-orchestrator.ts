/**
 * Graceful Shutdown Orchestrator
 *
 * Consolidates process lifecycle signal handlers (SIGTERM, SIGINT) into a single,
 * deterministic execution pipeline with phased cleanup:
 *
 * Phase 1: stop_accepting_work (halts ingress, scheduler ticks, new claims)
 * Phase 2: close_queues        (BullMQ workers/queues drain and close)
 * Phase 3: release_locks       (distributed Redis cron locks released via Lua)
 * Phase 4: close_connections   (database pools, Redis clients disconnected)
 *
 * Enforces a global deadline (default: 5000ms) before invoking process.exit(0) exactly once.
 */

export const SHUTDOWN_PHASES = [
  'stop_accepting_work',
  'close_queues',
  'release_locks',
  'close_connections',
] as const;

export type ShutdownPhase = (typeof SHUTDOWN_PHASES)[number];

export interface ShutdownHook {
  id: string;
  phase: ShutdownPhase;
  fn: () => Promise<void> | void;
}

interface OrchestratorState {
  isShuttingDown: boolean;
  shutdownPromise: Promise<void> | null;
  hooks: Map<string, ShutdownHook>;
  isSignalHandlerAttached: boolean;
}

const state: OrchestratorState = {
  isShuttingDown: false,
  shutdownPromise: null,
  hooks: new Map(),
  isSignalHandlerAttached: false,
};

/**
 * Register a cleanup hook to run during a specific shutdown phase.
 * Returns an unregister function.
 */
export function registerShutdownHook(
  phase: ShutdownPhase,
  id: string,
  fn: () => Promise<void> | void
): () => void {
  initShutdownOrchestrator();
  state.hooks.set(id, { id, phase, fn });
  return () => {
    state.hooks.delete(id);
  };
}

/**
 * Check if the shutdown sequence is currently in progress.
 */
export function isShuttingDown(): boolean {
  return state.isShuttingDown;
}

/**
 * Execute all registered shutdown phases sequentially.
 * Safe to call multiple times — returns the in-flight shutdown promise.
 */
export async function executeShutdown(options?: {
  timeoutMs?: number;
  exitOnComplete?: boolean;
  signal?: string;
}): Promise<void> {
  if (state.shutdownPromise) {
    return state.shutdownPromise;
  }

  state.isShuttingDown = true;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const exitOnComplete = options?.exitOnComplete ?? false;
  const signal = options?.signal ?? 'MANUAL';

  state.shutdownPromise = new Promise<void>((resolve) => {
    let completed = false;

    console.log(`[ShutdownOrchestrator] Starting graceful shutdown (${signal}, deadline: ${timeoutMs}ms)...`);

    const timer = setTimeout(() => {
      if (completed) return;
      completed = true;
      console.warn(`[ShutdownOrchestrator] Graceful shutdown deadline (${timeoutMs}ms) exceeded. Forcing exit.`);
      if (exitOnComplete) {
        process.exit(0);
      } else {
        resolve();
      }
    }, timeoutMs);

    if (timer.unref) {
      timer.unref();
    }

    (async () => {
      try {
        for (const phase of SHUTDOWN_PHASES) {
          if (completed) break;
          const phaseHooks = Array.from(state.hooks.values()).filter((h) => h.phase === phase);
          if (phaseHooks.length === 0) continue;

          console.log(`[ShutdownOrchestrator] Executing phase '${phase}' (${phaseHooks.length} hook(s))...`);

          const results = await Promise.allSettled(
            phaseHooks.map(async (hook) => {
              try {
                await hook.fn();
              } catch (err) {
                console.error(`[ShutdownOrchestrator] Error in hook '${hook.id}' during phase '${phase}':`, err);
                throw err;
              }
            })
          );

          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn(`[ShutdownOrchestrator] Phase '${phase}' completed with ${failed.length} failure(s).`);
          }
        }

        console.log('[ShutdownOrchestrator] All shutdown phases completed successfully.');
      } catch (err) {
        console.error('[ShutdownOrchestrator] Error during shutdown phases:', err);
      } finally {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          if (exitOnComplete) {
            process.exit(0);
          } else {
            resolve();
          }
        }
      }
    })();
  });

  return state.shutdownPromise;
}

/**
 * Attach SIGTERM/SIGINT listeners to the process once.
 */
export function initShutdownOrchestrator(): void {
  if (typeof process === 'undefined') return;

  const globalWithOrchestrator = globalThis as unknown as {
    __shutdownOrchestratorRegistered?: boolean;
  };
  if (globalWithOrchestrator.__shutdownOrchestratorRegistered || state.isSignalHandlerAttached) {
    return;
  }

  globalWithOrchestrator.__shutdownOrchestratorRegistered = true;
  state.isSignalHandlerAttached = true;

  const handleSignal = (signal: string) => {
    executeShutdown({ timeoutMs: 5000, exitOnComplete: true, signal }).catch((err) => {
      console.error('[ShutdownOrchestrator] Fatal error in shutdown handler:', err);
      process.exit(0);
    });
  };

  process.once('SIGTERM', () => handleSignal('SIGTERM'));
  process.once('SIGINT', () => handleSignal('SIGINT'));
}

/**
 * Test helper: resets the orchestrator state between unit tests.
 */
export function resetShutdownOrchestratorForTesting(): void {
  state.isShuttingDown = false;
  state.shutdownPromise = null;
  state.hooks.clear();
}
