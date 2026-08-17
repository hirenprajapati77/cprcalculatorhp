import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Documents the useCache=true response shape: auto-scan cache rows already carry
 * Trade Setup V3 entry/sl/target/rr from scanStock — must not be rewritten to TC/BC/R1.
 */
describe('scanner useCache trade levels', () => {
  it('preserves cached entry/sl/target/rr instead of forcing TC/BC/R1', () => {
    const cachedRow = {
      symbol: 'TEST',
      ltp: 100,
      score: 80,
      tc: 98,
      bc: 95,
      r1: 105,
      entry: 1849.05,
      sl: 1832.9,
      target: 1875.93,
      rr: 1.58,
      signalSummary: 'BREAKOUT,BULLISH',
    };

    const formatted = {
      ...cachedRow,
      market: 'NSE',
      sector: 'Auto-Scan Cache',
      volumeRatio: 1.0,
    };

    assert.equal(formatted.entry, 1849.05);
    assert.equal(formatted.sl, 1832.9);
    assert.equal(formatted.target, 1875.93);
    assert.equal(formatted.rr, 1.58);
    assert.notEqual(formatted.entry, cachedRow.tc);
    assert.notEqual(formatted.sl, cachedRow.bc);
    assert.notEqual(formatted.target, cachedRow.r1);
  });
});
