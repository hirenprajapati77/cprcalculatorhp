import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_LOT_SIZES,
  LOT_SIZE_LAST_VERIFIED_CYCLE,
} from '../../services/option-suggestion.service';

/**
 * R-3: NSE lot-size CI staleness test.
 *
 * SEBI revises F&O lot sizes twice a year (typically May and November).
 * This test ensures:
 *  1. All major index contracts are present and have a positive lot size.
 *  2. The verified cycle constant matches the source comment — a code edit that
 *     changes lot sizes without updating LOT_SIZE_LAST_VERIFIED_CYCLE will cause
 *     this test to fail, prompting the engineer to confirm and update the cycle.
 *
 * @reminder Next SEBI F&O lot-size revision cycle: ~November 2026.
 *   When SEBI publishes the new circular, update FALLBACK_LOT_SIZES in
 *   option-suggestion.service.ts and set LOT_SIZE_LAST_VERIFIED_CYCLE to the
 *   new circular reference (e.g. 'FAOPXXXXX_NOV2026').
 */

test('R-3: Option lot-size CI staleness guard', async (t) => {
  await t.test('LOT_SIZE_LAST_VERIFIED_CYCLE matches expected cycle identifier', () => {
    // When SEBI publishes a new circular, update FALLBACK_LOT_SIZES in service and
    // then update this expected string to the new circular reference.
    const EXPECTED_CYCLE = 'FAOP70616_OCT2025';
    assert.strictEqual(
      LOT_SIZE_LAST_VERIFIED_CYCLE,
      EXPECTED_CYCLE,
      `Lot-size cycle mismatch: source says "${LOT_SIZE_LAST_VERIFIED_CYCLE}", ` +
        `test expects "${EXPECTED_CYCLE}". ` +
        `If you updated lot sizes for a new SEBI revision cycle, update the ` +
        `EXPECTED_CYCLE constant in this test to the new circular reference.`
    );
  });

  await t.test('all major index contracts are present with positive lot sizes', () => {
    const REQUIRED_INDEX_CONTRACTS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];
    for (const symbol of REQUIRED_INDEX_CONTRACTS) {
      const lotSize = FALLBACK_LOT_SIZES[symbol];
      assert.ok(
        lotSize !== undefined,
        `FALLBACK_LOT_SIZES is missing "${symbol}" — update after each SEBI revision`
      );
      assert.ok(
        typeof lotSize === 'number' && lotSize >= 10,
        `FALLBACK_LOT_SIZES["${symbol}"] = ${lotSize} is not a valid lot size (must be >= 10)`
      );
    }
  });

  await t.test('all lot sizes are positive integers', () => {
    for (const [symbol, lotSize] of Object.entries(FALLBACK_LOT_SIZES)) {
      assert.ok(
        Number.isInteger(lotSize) && lotSize > 0,
        `FALLBACK_LOT_SIZES["${symbol}"] = ${lotSize} must be a positive integer`
      );
    }
  });

  await t.test('core Nifty 50 stocks are present', () => {
    const CORE_STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'WIPRO', 'LT'];
    for (const symbol of CORE_STOCKS) {
      assert.ok(
        FALLBACK_LOT_SIZES[symbol] !== undefined,
        `FALLBACK_LOT_SIZES is missing core stock "${symbol}"`
      );
    }
  });

  await t.test('NIFTY lot size matches FAOP70616_OCT2025 values', () => {
    // These values are from NSE circular FAOP70616 effective Oct 2025.
    // When these assertions fail after a SEBI update, update both the service and this test.
    assert.strictEqual(FALLBACK_LOT_SIZES['NIFTY'], 65, 'NIFTY lot size per FAOP70616');
    assert.strictEqual(FALLBACK_LOT_SIZES['BANKNIFTY'], 30, 'BANKNIFTY lot size per FAOP70616');
    assert.strictEqual(FALLBACK_LOT_SIZES['FINNIFTY'], 60, 'FINNIFTY lot size per FAOP70616');
    assert.strictEqual(FALLBACK_LOT_SIZES['MIDCPNIFTY'], 120, 'MIDCPNIFTY lot size per FAOP70616');
    assert.strictEqual(FALLBACK_LOT_SIZES['SENSEX'], 10, 'SENSEX lot size (BSE, unchanged)');
  });
});
