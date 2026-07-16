import test from 'node:test';
import assert from 'node:assert';
import { aggregateSignalAnalytics } from '../../services/analytics.service';

// Pure unit tests — no DB, no Prisma, no mocking needed.
const mockJournals = [
  { pnl: 100,  pnlPct: 1,    signalSummary: 'NARROW,BULLISH,KGS_DIRECT_UP' },
  { pnl: -50,  pnlPct: -0.5, signalSummary: 'BULLISH,KGS_CAM_BULL_BIAS'    },
  { pnl: 200,  pnlPct: 2,    signalSummary: 'NARROW,KGS_DIRECT_UP'          },
  { pnl: -100, pnlPct: -1,   signalSummary: 'BEARISH,KGS_REVERSAL_DOWN'     },
];

test('aggregateSignalAnalytics', async (t) => {
  const result = aggregateSignalAnalytics(mockJournals);

  await t.test('calculates baseline correctly', () => {
    assert.strictEqual(result.baselineTrades, 4);
    // 2 wins (pnl 100, 200) out of 4 = 50%
    assert.strictEqual(result.baselineWinRate, 50);
  });

  await t.test('aggregates KGS_DIRECT_UP correctly', () => {
    const directUp = result.signals.find(s => s.signal === 'KGS_DIRECT_UP');
    assert.ok(directUp, 'Should find KGS_DIRECT_UP');
    assert.strictEqual(directUp.trades, 2);
    assert.strictEqual(directUp.winRate, 100);  // Both trades profitable
    assert.strictEqual(directUp.lift, 50);      // 100% - 50% baseline
    assert.strictEqual(directUp.avgPnl, 150);   // (100 + 200) / 2
    assert.strictEqual(directUp.avgPnlPct, 1.5);
  });

  await t.test('aggregates BULLISH with neutral lift', () => {
    const bullish = result.signals.find(s => s.signal === 'BULLISH');
    assert.ok(bullish, 'Should find BULLISH');
    assert.strictEqual(bullish.trades, 2);
    assert.strictEqual(bullish.winRate, 50); // 1 win (100), 1 loss (-50)
    assert.strictEqual(bullish.lift, 0);     // 50% - 50% baseline = 0
    assert.strictEqual(bullish.avgPnl, 25);  // (100 - 50) / 2
  });

  await t.test('confidence is Low for small sample sizes', () => {
    const directUp = result.signals.find(s => s.signal === 'KGS_DIRECT_UP');
    assert.strictEqual(directUp?.confidence, 'Low'); // < 30 trades
  });

  await t.test('returns empty result for empty input', () => {
    const empty = aggregateSignalAnalytics([]);
    assert.strictEqual(empty.baselineTrades, 0);
    assert.strictEqual(empty.baselineWinRate, 0);
    assert.deepStrictEqual(empty.signals, []);
  });

  await t.test('handles null signalSummary gracefully', () => {
    const withNull = aggregateSignalAnalytics([
      { pnl: 100, pnlPct: 1, signalSummary: null },
      { pnl: -50, pnlPct: -0.5, signalSummary: 'BULLISH' },
    ]);
    assert.strictEqual(withNull.baselineTrades, 2);
    const bullish = withNull.signals.find(s => s.signal === 'BULLISH');
    assert.ok(bullish);
    assert.strictEqual(bullish.trades, 1);
  });
});
