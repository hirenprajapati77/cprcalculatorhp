import test from 'node:test';
import assert from 'node:assert';
import { computeOptionPnl } from '../../lib/pnl';

test('computeOptionPnl', async (t) => {
  await t.test('computes a winning long-premium trade', () => {
    const { pnl, pnlPct } = computeOptionPnl(100, 150);
    assert.strictEqual(pnl, 50);
    assert.strictEqual(pnlPct, 50);
  });

  await t.test('computes a losing trade with correct sign', () => {
    const { pnl, pnlPct } = computeOptionPnl(100, 80);
    assert.strictEqual(pnl, -20);
    assert.strictEqual(pnlPct, -20);
  });

  await t.test('rounds to 2 decimal places (no float noise)', () => {
    const { pnl, pnlPct } = computeOptionPnl(3, 3.333);
    assert.strictEqual(pnl, 0.33);
    // (0.333 / 3) * 100 = 11.1 -> 11.1
    assert.strictEqual(pnlPct, 11.1);
  });

  await t.test('never divides by zero — entryCmp 0 yields 0% not Infinity', () => {
    const { pnl, pnlPct } = computeOptionPnl(0, 50);
    assert.strictEqual(pnl, 50);
    assert.strictEqual(pnlPct, 0);
    assert.ok(Number.isFinite(pnlPct));
  });

  await t.test('handles negative entryCmp defensively without NaN', () => {
    const { pnl, pnlPct } = computeOptionPnl(-10, 5);
    assert.ok(Number.isFinite(pnl));
    assert.ok(Number.isFinite(pnlPct));
  });

  await t.test('breakeven is zero', () => {
    const { pnl, pnlPct } = computeOptionPnl(120, 120);
    assert.strictEqual(pnl, 0);
    assert.strictEqual(pnlPct, 0);
  });
});
