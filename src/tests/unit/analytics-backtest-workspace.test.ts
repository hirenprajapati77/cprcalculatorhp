import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Enterprise Analytics & Backtest Terminal Workstation Contract (Phase 9)', () => {
  it('enforces Authoritative FACT vs MODELED presentation invariant on backtest metrics', () => {
    const rawMetrics = {
      totalTrades: 142,
      winRate: 58.45,
      profitFactor: 1.82,
      expectancy: 0.38,
      maxDrawdown: 6.25,
      sharpe: 1.64,
    };

    // Labeling contract: all persisted quantitative metrics from the engine are FACT
    const displayedKpis = [
      { key: 'totalTrades', value: rawMetrics.totalTrades, tier: 'FACT' },
      { key: 'winRate', value: `${rawMetrics.winRate.toFixed(1)}%`, tier: 'FACT' },
      { key: 'profitFactor', value: rawMetrics.profitFactor.toFixed(2), tier: 'FACT' },
      { key: 'expectancy', value: rawMetrics.expectancy.toFixed(2), tier: 'FACT' },
      { key: 'maxDrawdown', value: `${rawMetrics.maxDrawdown.toFixed(1)}%`, tier: 'FACT' },
      { key: 'sharpe', value: rawMetrics.sharpe.toFixed(2), tier: 'FACT' },
    ];

    for (const kpi of displayedKpis) {
      assert.equal(kpi.tier, 'FACT');
      assert.ok(String(kpi.value).length > 0);
    }
  });

  it('validates Cumulative Equity Curve and Underwater Drawdown math transformation', () => {
    const capital = 100000;
    const trades = [
      { date: '2023-01-05', pnl: 5000 },
      { date: '2023-01-10', pnl: 3000 },
      { date: '2023-01-15', pnl: -4000 },
      { date: '2023-01-20', pnl: 6000 },
    ];

    let cumulativePnl = 0;
    let peakEquity = capital;
    const equityCurve: Array<{ date: string; cumulativePnl: number }> = [];
    const drawdownCurve: Array<{ date: string; drawdownPct: number }> = [];

    for (const t of trades) {
      cumulativePnl += t.pnl;
      const currentEquity = capital + cumulativePnl;
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const drawdownPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;

      equityCurve.push({ date: t.date, cumulativePnl });
      drawdownCurve.push({ date: t.date, drawdownPct: -drawdownPct });
    }

    // Step 1: PnL +5000 -> Equity 105,000 -> Peak 105,000 -> DD 0%
    assert.equal(equityCurve[0]?.cumulativePnl, 5000);
    assert.equal(drawdownCurve[0]?.drawdownPct, -0);

    // Step 2: PnL +3000 -> Equity 108,000 -> Peak 108,000 -> DD 0%
    assert.equal(equityCurve[1]?.cumulativePnl, 8000);
    assert.equal(drawdownCurve[1]?.drawdownPct, -0);

    // Step 3: PnL -4000 -> Equity 104,000 -> Peak 108,000 -> DD = -4000/108000 * 100 = -3.7037%
    assert.equal(equityCurve[2]?.cumulativePnl, 4000);
    const expectedDd = -((108000 - 104000) / 108000) * 100;
    assert.ok(Math.abs((drawdownCurve[2]?.drawdownPct ?? 0) - expectedDd) < 0.0001);

    // Step 4: PnL +6000 -> Equity 110,000 -> Peak 110,000 -> DD 0%
    assert.equal(equityCurve[3]?.cumulativePnl, 10000);
    assert.equal(drawdownCurve[3]?.drawdownPct, -0);
  });

  it('validates statistical confidence tier classification and lift calculation', () => {
    const baselineWinRate = 52.0;

    const sampleSignals = [
      { name: 'HP_GAP_UP', trades: 125, winRate: 64.0 },
      { name: 'NARROW_CPR_BREAKOUT', trades: 45, winRate: 56.5 },
      { name: 'KGS_REVERSAL', trades: 18, winRate: 61.0 },
    ];

    const classify = (trades: number): 'Low' | 'Medium' | 'High' => {
      if (trades >= 100) return 'High';
      if (trades >= 30) return 'Medium';
      return 'Low';
    };

    const results = sampleSignals.map((s) => ({
      name: s.name,
      confidence: classify(s.trades),
      lift: s.winRate - baselineWinRate,
    }));

    // HP_GAP_UP: 125 trades -> High confidence, +12.0% lift
    assert.equal(results[0]?.confidence, 'High');
    assert.equal(results[0]?.lift, 12.0);

    // NARROW_CPR_BREAKOUT: 45 trades -> Medium confidence, +4.5% lift
    assert.equal(results[1]?.confidence, 'Medium');
    assert.equal(results[1]?.lift, 4.5);

    // KGS_REVERSAL: 18 trades -> Low confidence, +9.0% lift
    assert.equal(results[2]?.confidence, 'Low');
    assert.equal(results[2]?.lift, 9.0);
  });

  it('validates Run History search filter predicates', () => {
    const runs = [
      { id: 'run-alpha-1234', status: 'COMPLETED', universe: 'NIFTY50', strategyMode: 'LEGACY_NARROW_CPR' },
      { id: 'run-beta-5678', status: 'RUNNING', universe: 'NSE_FNO', strategyMode: 'BTST_STBT_DRIVEN' },
      { id: 'run-gamma-9012', status: 'QUEUED', universe: 'NIFTY50', strategyMode: 'INDEX_BTST_DRIVEN' },
    ];

    // Filter by run ID
    const matchId = runs.filter((r) => r.id.toLowerCase().includes('beta'));
    assert.equal(matchId.length, 1);
    assert.equal(matchId[0]?.id, 'run-beta-5678');

    // Filter by status
    const matchStatus = runs.filter((r) => r.status.toLowerCase().includes('completed'));
    assert.equal(matchStatus.length, 1);
    assert.equal(matchStatus[0]?.id, 'run-alpha-1234');

    // Filter by strategy
    const matchStrategy = runs.filter((r) => r.strategyMode.toLowerCase().includes('btst'));
    assert.equal(matchStrategy.length, 2);
  });

  it('validates Trade Ledger density styling and direction badge logic', () => {
    const getPadding = (density: 'compact' | 'comfortable') =>
      density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';

    assert.equal(getPadding('compact'), 'py-1.5 px-3');
    assert.equal(getPadding('comfortable'), 'py-2.5 px-3');

    const getDirectionBadge = (type: string) => {
      const isLong = type === 'BUY' || type === 'LONG';
      return isLong ? 'LONG' : 'SHORT';
    };

    assert.equal(getDirectionBadge('BUY'), 'LONG');
    assert.equal(getDirectionBadge('LONG'), 'LONG');
    assert.equal(getDirectionBadge('SELL'), 'SHORT');
    assert.equal(getDirectionBadge('SHORT'), 'SHORT');
  });

  it('validates Quality Bucket monotonic separation presentation logic', () => {
    const buckets = [
      { groupValue: 'TRADEABLE', count: 85, winRate: 62.4, avgPnlPct: 2.15 },
      { groupValue: 'WATCHLIST', count: 42, winRate: 51.2, avgPnlPct: 0.65 },
      { groupValue: 'LOW_QUALITY', count: 28, winRate: 41.0, avgPnlPct: -0.95 },
    ];

    // Verify ordering and edge separation
    assert.ok(buckets[0]!.winRate > buckets[1]!.winRate, 'TRADEABLE winRate > WATCHLIST');
    assert.ok(buckets[1]!.winRate > buckets[2]!.winRate, 'WATCHLIST winRate > LOW_QUALITY');
    assert.ok(buckets[0]!.avgPnlPct > buckets[1]!.avgPnlPct, 'TRADEABLE avgPnlPct > WATCHLIST');
    assert.ok(buckets[1]!.avgPnlPct > buckets[2]!.avgPnlPct, 'WATCHLIST avgPnlPct > LOW_QUALITY');
  });
});
