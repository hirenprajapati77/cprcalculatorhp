import test from 'node:test';
import assert from 'node:assert/strict';
import { isScanInProgress } from '../../services/scanner-controller';

test('isScanInProgress is false when no scan is running', () => {
  assert.equal(isScanInProgress(), false);
});
