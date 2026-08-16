import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  overnightScanCacheKey,
  shouldDiscoverOvernightScan,
} from '../../lib/overnight-scan-cache';

describe('overnightScanCacheKey', () => {
  it('is date-scoped and stable', () => {
    assert.equal(overnightScanCacheKey('2026-08-16'), 'overnight_last_scan_2026-08-16');
  });
});

describe('shouldDiscoverOvernightScan', () => {
  it('serves cache in-window so UI polls do not re-run F&O discover', () => {
    assert.equal(shouldDiscoverOvernightScan(false, true, true), false);
  });

  it('discovers in-window when cache is empty', () => {
    assert.equal(shouldDiscoverOvernightScan(false, false, true), true);
  });

  it('does not discover outside the window without bypass', () => {
    assert.equal(shouldDiscoverOvernightScan(false, false, false), false);
    assert.equal(shouldDiscoverOvernightScan(false, true, false), false);
  });

  it('bypass always discovers even when cache exists', () => {
    assert.equal(shouldDiscoverOvernightScan(true, true, true), true);
    assert.equal(shouldDiscoverOvernightScan(true, true, false), true);
  });
});
