import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntryManagerService } from '../../services/overnight/entry-manager.service';
import type { MarketStockData } from '../../services/market.service';

/**
 * Hard liquidity gate used by OvernightService.discover (Advanced engine)
 * via EntryManagerService.evaluateEligibility — stocks failing these checks
 * are skipped before any signal / LOW_QUALITY flag is created.
 */
function liquidBase(partial: Partial<MarketStockData> = {}): MarketStockData {
  return {
    symbol: 'LIQ',
    market: 'NSE',
    sector: 'Test',
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    ltp: 102,
    volume: 200_000,
    avgVolume: 150_000,
    marketCap: 10_000,
    ...partial,
  };
}

describe('EntryManagerService hard liquidity gate (Advanced discover path)', () => {
  it('rejects avgVolume below 100k (hard exclude, not LOW_QUALITY flag)', () => {
    const stock = liquidBase({ avgVolume: 99_999, volume: 200_000 });
    const result = EntryManagerService.evaluateEligibility(stock, 100, 10_000, true);
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /avgVolume/);
  });

  it('rejects volume-ratio below 1.5 VDU hard gate', () => {
    // volume / avgVolume = 140000 / 100000 = 1.4 < 1.5
    const stock = liquidBase({ avgVolume: 100_000, volume: 140_000 });
    const result = EntryManagerService.evaluateEligibility(stock, 100, 10_000, true);
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /volumeRatio/);
  });

  it('allows stocks that clear avgVolume 100k and volume-ratio 1.5 (VDU)', () => {
    const stock = liquidBase({ avgVolume: 100_000, volume: 150_000 });
    const result = EntryManagerService.evaluateEligibility(stock, 100, 10_000, true);
    assert.equal(result.eligible, true);
  });
});
