import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapScanResultsForBreakoutAlert } from '@/services/alert/breakout-alert.pipeline';

describe('mapScanResultsForBreakoutAlert', () => {
  it('fills entry/sl/target fallbacks from tc/bc/r1 and ltp', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      {
        symbol: 'WIPRO',
        signals: ['BREAKOUT'],
        ltp: 100,
        tc: 101,
        bc: 99,
        r1: 105,
        score: 80,
        sector: 'IT',
        eventRiskScore: 10,
      },
    ]);
    assert.equal(mapped.entry, 101);
    assert.equal(mapped.sl, 99);
    assert.equal(mapped.target, 105);
    assert.equal(mapped.rr, '1:1.5');
    assert.equal(mapped.score, 80);
    assert.deepEqual(mapped.signals, ['BREAKOUT']);
  });

  it('uses ltp-based fallbacks when levels are missing', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      { symbol: 'SBIN', ltp: 200, signals: null },
    ]);
    assert.equal(mapped.entry, 200);
    assert.equal(mapped.sl, 198);
    assert.equal(mapped.target, 204);
    assert.equal(mapped.score, 0);
    assert.equal(mapped.sector, 'Other');
    assert.deepEqual(mapped.signals, []);
  });

  it('computes atrPct percent from history for L3 chase cap', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      {
        symbol: 'ITC',
        ltp: 400,
        signals: ['BREAKOUT'],
        history: Array.from({ length: 16 }, (_, i) => ({
          date: `2026-07-${String(i + 1).padStart(2, '0')}`,
          high: 402,
          low: 398,
          close: 400,
        })),
      },
    ]);
    assert.ok(mapped.atrPct != null && mapped.atrPct > 0);
    assert.ok(mapped.atrPct < 5, 'ITC-like range should be a small percent, not a 0–1 fraction');
  });
});
