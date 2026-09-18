import test from 'node:test';
import assert from 'node:assert';
import { computeJournalPnl, computeOptionPnl } from '../../lib/pnl';

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

test('computeJournalPnl direction-aware calculation', async (t) => {
  await t.test('UNDERLYING PE STBT where underlying rises -> loss', () => {
    const { pnl, pnlPct } = computeJournalPnl(100, 105, { isShortUnderlying: true });
    assert.strictEqual(pnl, -5);
    assert.strictEqual(pnlPct, -5);
  });

  await t.test('UNDERLYING PE STBT where underlying falls -> profit', () => {
    const { pnl, pnlPct } = computeJournalPnl(100, 95, { isShortUnderlying: true });
    assert.strictEqual(pnl, 5);
    assert.strictEqual(pnlPct, 5);
  });

  await t.test('PNBHOUSING historical values: entry 1106.30, exit 1121.90 -> loss of -15.60 (-1.41%)', () => {
    const { pnl, pnlPct } = computeJournalPnl(1106.3, 1121.9, { isShortUnderlying: true });
    assert.strictEqual(pnl, -15.6);
    assert.strictEqual(pnlPct, -1.41);
  });

  await t.test('Standard long option premium rises -> profit', () => {
    const { pnl, pnlPct } = computeJournalPnl(100, 150, { isShortUnderlying: false });
    assert.strictEqual(pnl, 50);
    assert.strictEqual(pnlPct, 50);
  });

  await t.test('Standard long option premium falls -> loss', () => {
    const { pnl, pnlPct } = computeJournalPnl(100, 80, { isShortUnderlying: false });
    assert.strictEqual(pnl, -20);
    assert.strictEqual(pnlPct, -20);
  });

  await t.test('Defaults to long premium when opts omitted', () => {
    const { pnl, pnlPct } = computeJournalPnl(100, 150);
    assert.strictEqual(pnl, 50);
    assert.strictEqual(pnlPct, 50);
  });
});
