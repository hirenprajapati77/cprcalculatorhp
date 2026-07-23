import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVixBand,
  computeIndexBtstSliceMetrics,
  parseIndexBtstTradeContext,
} from '../../services/backtest/index-btst-slice-metrics';

describe('index-btst-slice-metrics', () => {
  it('classifyVixBand uses production thresholds', () => {
    assert.equal(classifyVixBand(15), 'CALM');
    assert.equal(classifyVixBand(22), 'NEUTRAL');
    assert.equal(classifyVixBand(26), 'ELEVATED');
  });

  it('parseIndexBtstTradeContext reads nested context', () => {
    const ctx = parseIndexBtstTradeContext(
      JSON.stringify({
        classification: 'INDEX_READY',
        context: { vixClose: 18, vixBand: 'CALM', regimeTrend: 'BULL' },
      })
    );
    assert.equal(ctx.vixBand, 'CALM');
    assert.equal(ctx.regimeTrend, 'BULL');
    assert.equal(ctx.classification, 'INDEX_READY');
  });

  it('computeIndexBtstSliceMetrics groups by vix and regime', () => {
    const trades = [
      {
        pnl: 100,
        pnlPercent: 0.8,
        status: 'TARGET_HIT',
        signalsJson: JSON.stringify({ context: { vixBand: 'CALM', regimeTrend: 'BULL' } }),
      },
      {
        pnl: -50,
        pnlPercent: -0.3,
        status: 'SL_HIT',
        signalsJson: JSON.stringify({ context: { vixBand: 'CALM', regimeTrend: 'BULL' } }),
      },
      {
        pnl: 200,
        pnlPercent: 1.1,
        status: 'EOD_EXIT',
        signalsJson: JSON.stringify({ context: { vixBand: 'NEUTRAL', regimeTrend: 'CHOPPY' } }),
      },
    ];
    const { byVixBand, byRegime } = computeIndexBtstSliceMetrics(trades);
    assert.equal(byVixBand.CALM.count, 2);
    assert.equal(byVixBand.CALM.wins, 1);
    assert.equal(byVixBand.NEUTRAL.count, 1);
    assert.equal(byRegime.BULL.count, 2);
    assert.equal(byRegime.CHOPPY.count, 1);
  });
});
