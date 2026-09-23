import test from 'node:test';
import assert from 'node:assert/strict';
import { FNO_SYMBOLS } from '../../services/market-tools/market-breadth.service';

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

  await t.test('FNO_SYMBOLS is a non-empty Set', () => {
    assert.ok(FNO_SYMBOLS instanceof Set, 'FNO_SYMBOLS should be a Set');
    assert.ok(FNO_SYMBOLS.size >= 150, `FNO_SYMBOLS has only ${FNO_SYMBOLS.size} entries — suspiciously small`);
  });
});
