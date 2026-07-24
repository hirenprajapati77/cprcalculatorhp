import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeWinRate } from '../../lib/win-rate';

describe('computeWinRate', () => {
  it('excludes breakeven trades from the denominator', () => {
    const summary = computeWinRate(
      [{ pnl: 100 }, { pnl: 0 }, { pnl: -50 }],
      (trade) => trade.pnl
    );

    assert.equal(summary.wins, 1);
    assert.equal(summary.losses, 1);
    assert.equal(summary.breakeven, 1);
    assert.equal(summary.decisive, 2);
    assert.equal(summary.winRate, 50);
  });

  it('returns zero winRate without NaN when there are no decisive trades', () => {
    const allBreakeven = computeWinRate(
      [{ pnl: 0 }, { pnl: null }, { pnl: undefined }],
      (trade) => trade.pnl
    );
    const empty = computeWinRate([], (trade: { pnl?: number }) => trade.pnl);

    assert.equal(allBreakeven.wins, 0);
    assert.equal(allBreakeven.losses, 0);
    assert.equal(allBreakeven.breakeven, 3);
    assert.equal(allBreakeven.decisive, 0);
    assert.equal(allBreakeven.winRate, 0);
    assert.equal(Number.isFinite(allBreakeven.winRate), true);

    assert.equal(empty.decisive, 0);
    assert.equal(empty.winRate, 0);
    assert.equal(Number.isFinite(empty.winRate), true);
  });
});
