import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FNO_SYMBOLS,
  NIFTY50_SYMBOLS,
  filterNifty50Stats,
} from '../../services/market-tools/market-breadth.service';

/**
 * R-6: Bhavcopy alias presence test.
 *
 * Several NSE symbols have two representations in the Bhavcopy CSV:
 *  - The canonical NSE F&O contract name (used for derivatives)
 *  - A shorter Bhavcopy alias (used in equity segment CSV data)
 *
 * Both must be present in FNO_SYMBOLS so that OHLCV ingestion and market
 * breadth computation can match records regardless of which name appears.
 *
 * If NSE renames a symbol, the old alias should be removed from FNO_SYMBOLS
 * and this test updated. A failing test means a rename was missed, and the
 * symbol will silently drop out of breadth calculations.
 *
 * Known alias pairs (as of Sep 2026):
 *   AMBUJACEMENT (F&O) ↔ AMBUJACEM  (Bhavcopy equity CSV)
 *   TATACHEMICALS (F&O) ↔ TATACHEM  (Bhavcopy equity CSV)
 *   GMRINFRA (F&O)     ↔ GMRP&UI   (Bhavcopy equity CSV — post-merger name)
 *   TATAMOTORS (demerged) ↔ TMPV (Passenger Vehicles) & TMCV (Commercial Vehicles)
 *   LTIM (renamed) ↔ LTM
 *   ETERNAL (Eternal Limited, renamed from Zomato)
 */

test('R-6: Bhavcopy alias coverage in FNO_SYMBOLS', async (t) => {
  await t.test('AMBUJACEMENT / AMBUJACEM both present', () => {
    assert.ok(
      FNO_SYMBOLS.has('AMBUJACEMENT'),
      'FNO_SYMBOLS must include AMBUJACEMENT (F&O canonical name)'
    );
    assert.ok(
      FNO_SYMBOLS.has('AMBUJACEM'),
      'FNO_SYMBOLS must include AMBUJACEM (Bhavcopy equity alias) — if NSE renamed it, update this test'
    );
  });

  await t.test('TATACHEMICALS / TATACHEM both present', () => {
    assert.ok(
      FNO_SYMBOLS.has('TATACHEMICALS'),
      'FNO_SYMBOLS must include TATACHEMICALS (F&O canonical name)'
    );
    assert.ok(
      FNO_SYMBOLS.has('TATACHEM'),
      'FNO_SYMBOLS must include TATACHEM (Bhavcopy equity alias) — if NSE renamed it, update this test'
    );
  });

  await t.test('GMRINFRA / GMRP&UI both present', () => {
    assert.ok(
      FNO_SYMBOLS.has('GMRINFRA'),
      'FNO_SYMBOLS must include GMRINFRA (F&O canonical name)'
    );
    assert.ok(
      FNO_SYMBOLS.has('GMRP&UI'),
      'FNO_SYMBOLS must include GMRP&UI (Bhavcopy equity alias post-merger) — if NSE renamed it, update this test'
    );
  });

  await t.test('ETERNAL, TMPV, and LTM active listings in FNO_SYMBOLS (Fix 3a)', () => {
    assert.ok(FNO_SYMBOLS.has('ETERNAL'), 'FNO_SYMBOLS must include ETERNAL');
    assert.ok(FNO_SYMBOLS.has('TMPV'), 'FNO_SYMBOLS must include TMPV (Tata Motors demerged F&O entity)');
    assert.ok(FNO_SYMBOLS.has('LTM'), 'FNO_SYMBOLS must include LTM (LTIMindtree renamed ticker)');
  });

  await t.test('FNO_SYMBOLS is a non-empty Set', () => {
    assert.ok(FNO_SYMBOLS instanceof Set, 'FNO_SYMBOLS should be a Set');
    assert.ok(FNO_SYMBOLS.size >= 150, `FNO_SYMBOLS has only ${FNO_SYMBOLS.size} entries — suspiciously small`);
  });
});

test('NIFTY50_SYMBOLS coverage (Fix 3a)', async (t) => {
  await t.test('contains active constituents TATASTEEL, ETERNAL, TMPV, BSE, BEL, HINDALCO, INDIGO, JIOFIN, MAXHEALTH', () => {
    assert.ok(NIFTY50_SYMBOLS.has('TATASTEEL'), 'NIFTY50_SYMBOLS must include TATASTEEL');
    assert.ok(NIFTY50_SYMBOLS.has('ETERNAL'), 'NIFTY50_SYMBOLS must include ETERNAL');
    assert.ok(NIFTY50_SYMBOLS.has('TMPV'), 'NIFTY50_SYMBOLS must include TMPV');
    assert.ok(NIFTY50_SYMBOLS.has('BSE'), 'NIFTY50_SYMBOLS must include BSE');
    assert.ok(NIFTY50_SYMBOLS.has('BEL'), 'NIFTY50_SYMBOLS must include BEL');
    assert.ok(NIFTY50_SYMBOLS.has('HINDALCO'), 'NIFTY50_SYMBOLS must include HINDALCO');
    assert.ok(NIFTY50_SYMBOLS.has('INDIGO'), 'NIFTY50_SYMBOLS must include INDIGO');
    assert.ok(NIFTY50_SYMBOLS.has('JIOFIN'), 'NIFTY50_SYMBOLS must include JIOFIN');
    assert.ok(NIFTY50_SYMBOLS.has('MAXHEALTH'), 'NIFTY50_SYMBOLS must include MAXHEALTH');
    assert.ok(!NIFTY50_SYMBOLS.has('WIPRO'), 'WIPRO must NOT be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('LTM'), 'LTM must NOT be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('DIVISLAB'), 'DIVISLAB must NOT be in active NIFTY50_SYMBOLS');
  });

  await t.test('NIFTY50_SYMBOLS has exactly 50 symbols and excludes exited constituents', () => {
    assert.ok(NIFTY50_SYMBOLS instanceof Set, 'NIFTY50_SYMBOLS should be a Set');
    assert.equal(NIFTY50_SYMBOLS.size, 50, `NIFTY50_SYMBOLS size (${NIFTY50_SYMBOLS.size}) must be exactly 50`);
    // Exited constituents must not be present in active NIFTY50_SYMBOLS
    assert.ok(!NIFTY50_SYMBOLS.has('WIPRO'), 'WIPRO must not be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('BPCL'), 'BPCL must not be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('BRITANNIA'), 'BRITANNIA must not be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('DIVISLAB'), 'DIVISLAB must not be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('HEROMOTOCO'), 'HEROMOTOCO must not be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('INDUSINDBK'), 'INDUSINDBK must not be in active NIFTY50_SYMBOLS');
    assert.ok(!NIFTY50_SYMBOLS.has('LTM'), 'LTM must not be in active NIFTY50_SYMBOLS');
  });

  await t.test('filterNifty50Stats helper strictly filters to active 50 and handles space-padding', () => {
    const mockOperatingStats = [
      { symbol: 'RELIANCE' },
      { symbol: 'TCS   ' }, // space-padded
      { symbol: 'HDFCBANK' },
      { symbol: 'WIPRO' },     // exited constituent
      { symbol: 'BPCL' },      // exited constituent
      { symbol: 'DIVISLAB' },  // exited constituent
      { symbol: 'TATAMOTORS' } // historical alias for TMPV
    ];
    const filtered = filterNifty50Stats(mockOperatingStats);
    assert.equal(filtered.length, 3, 'Only active members match; exited and alias members excluded');
    assert.deepEqual(filtered.map(s => s.symbol.trim()), ['RELIANCE', 'TCS', 'HDFCBANK']);
  });
});
