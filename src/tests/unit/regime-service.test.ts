import test from 'node:test';
import assert from 'node:assert';
import { RegimeService } from '../../services/overnight/regime.service';
import { HistoricalProvider } from '../../services/backtest/historical.provider';

test('RegimeService - EMA Edge Case Fix', async (t) => {
  const originalGetHistory = HistoricalProvider.getHistory;
  
  t.afterEach(() => {
    HistoricalProvider.getHistory = originalGetHistory;
    // @ts-expect-error accessing private property for test reset
    RegimeService.cachedRegime = null;
  });

  await t.test('length=19 returns DEFAULT regime (CHOPPY/LOW/50)', async () => {
    HistoricalProvider.getHistory = async () => Array.from({ length: 19 }).map((_, i) => ({
      date: `2026-07-${i+1 < 10 ? '0'+(i+1) : i+1}`, open: 100+i, high: 102+i, low: 98+i, close: 100+i, volume: 1000
    }));

    const regime = await RegimeService.getMarketRegime('2026-07-20');
    assert.strictEqual(regime.trend, 'CHOPPY');
    assert.strictEqual(regime.score, 50);
  });

  await t.test('length=20 returns DEFAULT regime instead of spurious BULL', async () => {
    HistoricalProvider.getHistory = async () => Array.from({ length: 20 }).map((_, i) => ({
      date: `2026-07-${i+1 < 10 ? '0'+(i+1) : i+1}`, open: 100+i, high: 102+i, low: 98+i, close: 100+i, volume: 1000
    }));

    const regime = await RegimeService.getMarketRegime('2026-07-20');
    assert.strictEqual(regime.trend, 'CHOPPY', 'Expected DEFAULT (CHOPPY) due to length < 21');
    assert.strictEqual(regime.score, 50);
  });

  await t.test('length=21 computes a genuine trend (not default, not spurious)', async () => {
    HistoricalProvider.getHistory = async () => Array.from({ length: 21 }).map((_, i) => ({
      date: `2026-07-${i+1 < 10 ? '0'+(i+1) : i+1}`, open: 100+i, high: 102+i, low: 98+i, close: 100+i, volume: 1000
    }));

    const regime = await RegimeService.getMarketRegime('2026-07-20');
    assert.strictEqual(regime.trend, 'BULL', 'Expected BULL trend due to rising prices and valid EMA');
    assert.strictEqual(regime.score, 80);
  });
});
