import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterIndexRowsForDisplay, primaryIndexReason } from '../../lib/index-display';

describe('filterIndexRowsForDisplay', () => {
  const rows = [
    { symbol: 'NIFTY', scanType: 'INTRA', score: 20, classification: 'IGNORE' },
    { symbol: 'BANKNIFTY', scanType: 'INTRA', score: 5, classification: 'IGNORE' },
    { symbol: 'NIFTY', scanType: 'BTST', score: null, classification: 'IGNORE' },
    { symbol: 'BANKNIFTY', scanType: 'BTST', score: null, classification: 'IGNORE' },
    { symbol: 'NIFTY', scanType: 'BTST', score: 90, classification: 'INDEX_READY' },
  ];

  it('hides null-score BTST outside discovery window', () => {
    const visible = filterIndexRowsForDisplay(rows, false);
    assert.equal(visible.length, 3);
    assert.ok(visible.every((r) => !(r.scanType === 'BTST' && r.score === null)));
    assert.ok(visible.some((r) => r.scanType === 'BTST' && r.score === 90));
  });

  it('shows null-score BTST inside discovery window', () => {
    const visible = filterIndexRowsForDisplay(rows, true);
    assert.equal(visible.length, 5);
  });

  it('always keeps INTRA rows', () => {
    const visible = filterIndexRowsForDisplay(rows, false);
    assert.equal(visible.filter((r) => r.scanType === 'INTRA').length, 2);
  });
});

describe('primaryIndexReason', () => {
  it('returns first non-empty reason', () => {
    assert.equal(primaryIndexReason(['', ' India VIX calm ', 'Narrow CPR']), ' India VIX calm ');
  });

  it('returns null when missing', () => {
    assert.equal(primaryIndexReason(null), null);
    assert.equal(primaryIndexReason([]), null);
  });
});
