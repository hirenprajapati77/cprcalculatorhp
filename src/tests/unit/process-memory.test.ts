import test from 'node:test';
import assert from 'node:assert';
import { getProcessMemorySnapshot } from '../../lib/process-memory';

test('getProcessMemorySnapshot returns positive MB values', () => {
  const snap = getProcessMemorySnapshot();
  assert.ok(snap.rssMb > 0);
  assert.ok(snap.heapUsedMb > 0);
  assert.ok(snap.heapTotalMb >= snap.heapUsedMb);
  assert.ok(snap.externalMb >= 0);
});
