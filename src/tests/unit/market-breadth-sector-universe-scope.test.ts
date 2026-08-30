import test from 'node:test';
import assert from 'node:assert';
import { computeSectorBreadth } from '../../services/market-tools/market-breadth.service';

// Regression test for: Sector Strength table showed identical totals on the
// ALL NSE / Nifty 50 / F&O tabs because computeSectorBreadth() was only ever
// called once against the full ALL_NSE stockStats array. Verified live: the
// "total" column across all sector rows summed to exactly 2632 (the ALL_NSE
// count) even while the Nifty 50 (48 stocks) and F&O (166 stocks) tabs were
// selected. Fix: compute it once per universe using the same filtered stats
// already used to build allNse/nifty50/nseFno.

test('computeSectorBreadth scopes totals to the input universe, not a global universe', () => {
  const allNseStats = Array.from({ length: 2632 }, (_, i) => ({
    symbol: `SYM${i}`,
    changePct: i % 2 === 0 ? 1 : -1,
  }));
  const nifty50Stats = allNseStats.slice(0, 48);
  const fnoStats = allNseStats.slice(0, 166);

  const allNseSectors = computeSectorBreadth(allNseStats);
  const nifty50Sectors = computeSectorBreadth(nifty50Stats);
  const fnoSectors = computeSectorBreadth(fnoStats);

  const sumTotals = (rows: ReturnType<typeof computeSectorBreadth>) =>
    rows.reduce((sum, r) => sum + r.totalStocks, 0);

  assert.strictEqual(sumTotals(allNseSectors), 2632);

  // The bug: reusing allNseSectors for every tab would make these assertions
  // fail (both would incorrectly equal 2632 instead of their own universe size).
  assert.strictEqual(sumTotals(nifty50Sectors), 48);
  assert.strictEqual(sumTotals(fnoSectors), 166);

  assert.notStrictEqual(sumTotals(nifty50Sectors), sumTotals(allNseSectors));
  assert.notStrictEqual(sumTotals(fnoSectors), sumTotals(allNseSectors));
});
