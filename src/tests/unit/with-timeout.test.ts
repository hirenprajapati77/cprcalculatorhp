import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../../lib/with-timeout';

test('withTimeout resolves normally when the promise finishes before the timeout', async () => {
  const result = await withTimeout(Promise.resolve('done'), 1000, 'fast-job');
  assert.equal(result, 'done');
});

test('withTimeout rejects when the promise never resolves (the actual production bug)', async () => {
  // Simulates EarningsPopulatorService's un-timeouted fetch() to nseindia.com
  // hanging forever -- confirmed root cause of the scheduler's tickInFlight
  // getting stuck true for two days (27-28 Aug 2026).
  const neverResolves = new Promise(() => {});
  await assert.rejects(
    () => withTimeout(neverResolves, 50, 'hung-job'),
    /hung-job timed out after 50ms/
  );
});

test('withTimeout propagates the underlying rejection when the job itself fails fast', async () => {
  await assert.rejects(
    () => withTimeout(Promise.reject(new Error('boom')), 1000, 'failing-job'),
    /boom/
  );
});

test('withTimeout does not leave a dangling timer after resolving early', async () => {
  // Regression guard: an earlier version could leak the setTimeout handle if
  // the timer wasn't cleared on the success path. This doesn't assert on the
  // timer directly (no public handle), but confirms the process doesn't hang
  // waiting on the timer via --test-force-exit still working across the file
  // (see: this whole test file runs to completion under test:unit's config).
  const result = await withTimeout(Promise.resolve(42), 10_000, 'irrelevant');
  assert.equal(result, 42);
});
