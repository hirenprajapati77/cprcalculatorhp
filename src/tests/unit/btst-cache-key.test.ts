import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { btstScanCacheKey } from '../../lib/btst-cache-key';

describe('btstScanCacheKey (P1-1)', () => {
  const today = '19-7-2026';

  it('includes universe so NIFTY50 and FNO do not share a key', () => {
    const nifty = btstScanCacheKey(today, 'NIFTY50');
    const fno = btstScanCacheKey(today, 'NSE_FNO');
    assert.notEqual(nifty, fno);
    assert.equal(nifty, `btst_last_scan_${today}_NIFTY50`);
    assert.equal(fno, `btst_last_scan_${today}_NSE_FNO`);
  });

  it('defaults blank universe to NIFTY50 (same as route)', () => {
    assert.equal(btstScanCacheKey(today, ''), `btst_last_scan_${today}_NIFTY50`);
    assert.equal(btstScanCacheKey(today, '   '), `btst_last_scan_${today}_NIFTY50`);
  });

  it('ALL / NIFTY50 / NSE_FNO are pairwise distinct', () => {
    const keys = ['NIFTY50', 'NSE_FNO', 'ALL'].map((u) => btstScanCacheKey(today, u));
    assert.equal(new Set(keys).size, 3);
  });
});
