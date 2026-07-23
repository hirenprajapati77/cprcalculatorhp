import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitState, DatabaseCircuitBreaker } from '../../lib/circuit-breaker';

/** Runtime access to private static fields (TS `private` is erase-only). */
type BreakerStatic = {
  state: CircuitState;
  nextAttemptAt: number;
};

function internals(): BreakerStatic {
  return DatabaseCircuitBreaker as unknown as BreakerStatic;
}

function resetBreaker(): void {
  const b = internals();
  b.state = CircuitState.CLOSED;
  b.nextAttemptAt = 0;
}

test('DatabaseCircuitBreaker — HALF_OPEN non-connection probe closes circuit', async (t) => {
  t.after(() => resetBreaker());
  resetBreaker();

  // Trip to OPEN via a connection-style failure.
  await assert.rejects(
    () =>
      DatabaseCircuitBreaker.execute(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      }),
    /CIRCUIT_OPEN/
  );
  assert.equal(internals().state, CircuitState.OPEN);

  // Expire cooldown so the next call becomes the probe (OPEN → HALF_OPEN).
  internals().nextAttemptAt = Date.now() - 1;

  await assert.rejects(
    () =>
      DatabaseCircuitBreaker.execute(async () => {
        throw new Error('Record to update not found.');
      }),
    /Record to update not found/
  );

  // Bug was: state stayed HALF_OPEN and every later call threw CIRCUIT_OPEN.
  assert.equal(internals().state, CircuitState.CLOSED);

  const value = await DatabaseCircuitBreaker.execute(async () => 42);
  assert.equal(value, 42);
});

test('DatabaseCircuitBreaker — connection error on probe re-opens with cooldown', async (t) => {
  t.after(() => resetBreaker());
  resetBreaker();

  await assert.rejects(
    () =>
      DatabaseCircuitBreaker.execute(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      }),
    /CIRCUIT_OPEN/
  );
  internals().nextAttemptAt = Date.now() - 1;

  await assert.rejects(
    () =>
      DatabaseCircuitBreaker.execute(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
      }),
    /CIRCUIT_OPEN/
  );

  assert.equal(internals().state, CircuitState.OPEN);
  assert.ok(internals().nextAttemptAt > Date.now());
});
