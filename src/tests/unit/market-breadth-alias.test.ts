import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FNO_SYMBOLS,
  NIFTY50_SYMBOLS,
  NIFTY50_HISTORICAL_ALIASES,
  isNifty50Symbol,
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

  await t.test('NIFTY50_SYMBOLS has exactly 50 symbols', () => {
    assert.ok(NIFTY50_SYMBOLS instanceof Set, 'NIFTY50_SYMBOLS should be a Set');
    assert.equal(NIFTY50_SYMBOLS.size, 50, `NIFTY50_SYMBOLS size (${NIFTY50_SYMBOLS.size}) must be exactly 50`);
  });

  await t.test('historical aliases are recognized by isNifty50Symbol', () => {
    assert.ok(isNifty50Symbol('TATAMOTORS'), 'TATAMOTORS should be recognized as Nifty 50 historical alias');
    assert.ok(isNifty50Symbol('LTIM'), 'LTIM should be recognized as Nifty 50 historical alias');
    assert.ok(isNifty50Symbol('WIPRO'), 'WIPRO should be recognized as Nifty 50 historical alias');
    assert.ok(isNifty50Symbol('LTM'), 'LTM should be recognized as Nifty 50 historical alias');
    assert.ok(isNifty50Symbol('DIVISLAB'), 'DIVISLAB should be recognized as Nifty 50 historical alias');
    assert.ok(isNifty50Symbol('TMPV'), 'TMPV should be recognized as active Nifty 50 constituent');
    assert.ok(isNifty50Symbol('TATASTEEL'), 'TATASTEEL should be recognized as active Nifty 50 constituent');
    assert.ok(isNifty50Symbol('ETERNAL'), 'ETERNAL should be recognized as active Nifty 50 constituent');
    assert.ok(isNifty50Symbol('BSE'), 'BSE should be recognized as active Nifty 50 constituent');
    assert.ok(NIFTY50_HISTORICAL_ALIASES.has('TATAMOTORS'), 'TATAMOTORS in NIFTY50_HISTORICAL_ALIASES');
    assert.ok(NIFTY50_HISTORICAL_ALIASES.has('LTIM'), 'LTIM in NIFTY50_HISTORICAL_ALIASES');
    assert.ok(NIFTY50_HISTORICAL_ALIASES.has('WIPRO'), 'WIPRO in NIFTY50_HISTORICAL_ALIASES');
    assert.ok(!NIFTY50_HISTORICAL_ALIASES.has('TATASTEEL'), 'TATASTEEL must NOT be in historical aliases');
    assert.ok(!NIFTY50_HISTORICAL_ALIASES.has('ETERNAL'), 'ETERNAL must NOT be in historical aliases');
    assert.ok(!NIFTY50_HISTORICAL_ALIASES.has('BSE'), 'BSE must NOT be in historical aliases');
  });
});
