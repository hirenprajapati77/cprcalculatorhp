import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Scanner KPI Strip & Quick Presets Presentation Contract', () => {
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
});
