import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { indexScanCacheKey } from '../../lib/index-cache-key';

describe('Index Scan Cache Key', () => {
  it('generates a unique cache key for a given date', () => {
    const key = indexScanCacheKey('2024-01-01');
    assert.equal(key, 'index_last_scan_2024-01-01');
  });

  it('generates a different key for a different date', () => {
    const key1 = indexScanCacheKey('2024-01-01');
    const key2 = indexScanCacheKey('2024-01-02');
    assert.notEqual(key1, key2);
  });
});
