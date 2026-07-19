import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntryManagerService, EXTENSION_LIMITS } from '../../services/overnight/entry-manager.service';
import type { MarketStockData } from '../../services/market.service';
import { getISTDateString } from '../../lib/market-hours';

function stock(partial: Partial<MarketStockData> & Pick<MarketStockData, 'high' | 'low' | 'close' | 'ltp'>): MarketStockData {
  return {
    symbol: 'TEST',
    market: 'NSE',
    sector: 'Test',
    open: partial.open ?? partial.close,
    volume: 1_000_000,
    avgVolume: 500_000,
    marketCap: 10_000,
    previousClose: 100,
    history: [
      { date: '2026-07-15', open: 100, high: 102, low: 98, close: 100, volume: 500000 },
      { date: '2026-07-16', open: 100, high: 102, low: 98, close: 100, volume: 500000 },
    ],
    ...partial,
  };
}

describe('Extension / exhaustion gate (DIXON-class days)', () => {
  it('rejects LONG BTST after a >3.5% up day (DIXON-style extension)', () => {
    // +5.7% day ~ 800pts on a ~14k name
    const s = stock({
      previousClose: 100,
      open: 101,
      high: 107,
      low: 100.5,
      close: 105.7,
      ltp: 105.7,
    });
    const result = EntryManagerService.evaluateExtension(s, 'LONG');
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /EXTENDED_UP/);
  });

  it('allows LONG BTST on a normal ~1% up day', () => {
    const s = stock({
      previousClose: 100,
      open: 100.2,
      high: 101.5,
      low: 99.8,
      close: 101,
      ltp: 101,
    });
    const result = EntryManagerService.evaluateExtension(s, 'LONG');
    assert.equal(result.eligible, true);
  });

  it('rejects SHORT STBT after a sharp dump day', () => {
    const s = stock({
      previousClose: 100,
      open: 99,
      high: 99.5,
      low: 94,
      close: 95,
      ltp: 95,
    });
    const result = EntryManagerService.evaluateExtension(s, 'SHORT');
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /EXTENDED_DOWN/);
  });

  it('exposes configured limits used by the gate', () => {
    assert.equal(EXTENSION_LIMITS.MAX_DAY_RETURN_PCT, 3.5);
    assert.ok(EXTENSION_LIMITS.MAX_RETURN_ATR_MULT >= 1.5);
  });

  it('history fallback: when last bar is prior session, previousClose is last.close (not n-2)', () => {
    // previousClose omitted; last hist bar is not "today" — live LTP vs that close.
    const s = stock({
      previousClose: undefined,
      history: [
        { date: '2026-07-14', open: 90, high: 92, low: 88, close: 90, volume: 500000 },
        { date: '2026-07-15', open: 100, high: 102, low: 98, close: 100, volume: 500000 },
      ],
      open: 100,
      high: 106,
      low: 99,
      close: 105,
      ltp: 105, // +5% vs last.close=100; would be wrong vs n-2=90 (+16.7%)
    });
    const prev = EntryManagerService.resolvePreviousClose(s);
    assert.equal(prev, 100);
    const result = EntryManagerService.evaluateExtension(s, 'LONG');
    assert.equal(result.eligible, false);
    assert.match(result.reason || '', /EXTENDED_UP/);
  });

  it('history fallback: when last bar is today, previousClose is n-2', () => {
    const today = getISTDateString();
    const s = stock({
      previousClose: undefined,
      history: [
        { date: '2026-07-14', open: 90, high: 92, low: 88, close: 90, volume: 500000 },
        { date: '2026-07-15', open: 100, high: 102, low: 98, close: 100, volume: 500000 },
        { date: today, open: 101, high: 107, low: 100.5, close: 105.7, volume: 600000 },
      ],
      open: 101,
      high: 107,
      low: 100.5,
      close: 105.7,
      ltp: 105.7,
    });
    assert.equal(EntryManagerService.resolvePreviousClose(s), 100);
    const result = EntryManagerService.evaluateExtension(s, 'LONG');
    assert.equal(result.eligible, false);
  });
});
