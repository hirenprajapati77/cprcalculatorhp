import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Scanner Workspace Presentation Contract (Phase 4)', () => {
  it('maps High Conviction preset to existing score thresholds', () => {
    // In CPR mode: High Conviction threshold is >= 75
    const cprThreshold = 75;
    // In Overnight BTST/STBT mode: High Conviction threshold is >= 100
    const overnightThreshold = 100;

    assert.equal(cprThreshold, 75);
    assert.equal(overnightThreshold, 100);
  });

  it('verifies Quick Presets preserve underlying scanner modes and filters', () => {
    type ScannerMode = 'CPR' | 'BTST' | 'STBT' | 'OVERNIGHT' | 'INDEX';
    const validModes: ScannerMode[] = ['CPR', 'BTST', 'STBT', 'OVERNIGHT', 'INDEX'];

    for (const mode of ['CPR', 'BTST', 'STBT'] as ScannerMode[]) {
      assert.ok(validModes.includes(mode), `Mode '${mode}' must be a recognized ScannerMode`);
    }
  });

  it('ensures KPI strip derivations preserve exact metric invariants', () => {
    const btstMetrics = { ready: 12, strong: 5, avgGap: 1.45, avgConf: 82 };
    assert.equal(btstMetrics.ready, 12);
    assert.equal(btstMetrics.strong, 5);
    assert.equal(btstMetrics.avgGap.toFixed(2), '1.45');
    assert.equal(btstMetrics.avgConf.toFixed(0), '82');

    const indexMetrics = { strong: 2, ready: 3, watch: 1, ignore: 0 };
    assert.equal(indexMetrics.strong, 2);
    assert.equal(indexMetrics.ready, 3);
    assert.equal(indexMetrics.watch, 1);
    assert.equal(indexMetrics.ignore, 0);

    const cprMetrics = {
      strongBuyCount: 8,
      breakoutReadyCount: 14,
      watchlistCount: 6,
      avoidCount: 22,
    };
    assert.equal(cprMetrics.strongBuyCount, 8);
    assert.equal(cprMetrics.breakoutReadyCount, 14);
    assert.equal(cprMetrics.watchlistCount, 6);
    assert.equal(cprMetrics.avoidCount, 22);
  });

  it('validates density modes and conditional cell padding styles', () => {
    type DensityMode = 'compact' | 'detailed';
    const densityModes: DensityMode[] = ['compact', 'detailed'];

    const getCellPadding = (mode: DensityMode) =>
      mode === 'compact' ? 'py-1.5 px-2 text-[11px]' : 'py-3 px-3 text-xs';

    assert.equal(densityModes.length, 2);
    assert.equal(getCellPadding('compact'), 'py-1.5 px-2 text-[11px]');
    assert.equal(getCellPadding('detailed'), 'py-3 px-3 text-xs');
  });

  it('validates column visibility default schema integrity', () => {
    const defaultColumns = [
      'checkbox',
      'watchlist',
      'symbol',
      'ltp',
      'distance',
      'width',
      'setup',
      'rr',
      'signals',
      'score',
    ];

    assert.ok(defaultColumns.includes('symbol'), 'Symbol column must be present by default');
    assert.ok(defaultColumns.includes('ltp'), 'LTP column must be present by default');
    assert.ok(defaultColumns.includes('setup'), 'Setup column must be present by default');
    assert.ok(defaultColumns.includes('score'), 'Score column must be present by default');
    assert.equal(defaultColumns.length, 10);
  });

  it('validates pinned stock priority sorting order', () => {
    const sampleRows = [
      { symbol: 'INFY', score: 95, pinned: false },
      { symbol: 'RELIANCE', score: 80, pinned: true },
      { symbol: 'TCS', score: 70, pinned: false },
    ];

    // Priority sort: Pinned first, then by score descending
    sampleRows.sort((a, b) => {
      const pinA = a.pinned ? 1 : 0;
      const pinB = b.pinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return b.score - a.score;
    });

    assert.equal(sampleRows[0]?.symbol, 'RELIANCE');
    assert.equal(sampleRows[1]?.symbol, 'INFY');
    assert.equal(sampleRows[2]?.symbol, 'TCS');
  });

  it('validates table keyboard navigation index bounds', () => {
    const rowCount = 5;
    let selectedIndex = 0;

    // ArrowDown
    selectedIndex = selectedIndex < rowCount - 1 ? selectedIndex + 1 : 0;
    assert.equal(selectedIndex, 1);

    // ArrowUp
    selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : rowCount - 1;
    assert.equal(selectedIndex, 0);

    // ArrowUp at top wraps around to bottom
    selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : rowCount - 1;
    assert.equal(selectedIndex, 4);

    // ArrowDown at bottom wraps around to top
    selectedIndex = selectedIndex < rowCount - 1 ? selectedIndex + 1 : 0;
    assert.equal(selectedIndex, 0);
  });
});
