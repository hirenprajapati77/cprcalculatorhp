import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntryManagerService } from '../../services/overnight/entry-manager.service';
import { MarketStockData } from '../../services/market.service';

describe('EntryManagerService (Tier 2 coverage)', () => {
  const validStock: MarketStockData = {
    symbol: 'INFY',
    market: 'NSE',
    sector: 'IT',
    marketCap: 50000,
    open: 1500,
    high: 1520,
    low: 1490,
    close: 1515,
    ltp: 1515,
    volume: 700000,
    avgVolume: 400000, // volumeRatio = 1.75 >= 1.5
    previousClose: 1500,
    history: [
      { date: '2026-09-07', open: 1480, high: 1505, low: 1475, close: 1495, volume: 350000 },
      { date: '2026-09-08', open: 1495, high: 1510, low: 1490, close: 1500, volume: 420000 },
    ],
  };

  describe('evaluateEligibility', () => {
    it('rejects when hasIntraday is false', () => {
      const res = EntryManagerService.evaluateEligibility(validStock, 1510, 20000, false);
      assert.equal(res.eligible, false);
      assert.equal(res.reason, 'No intraday data');
    });

    it('rejects when stock has missing high or low', () => {
      const incomplete = { ...validStock, high: undefined as unknown as number };
      const res = EntryManagerService.evaluateEligibility(incomplete, 1510, 20000, true);
      assert.equal(res.eligible, false);
      assert.equal(res.reason, 'Insufficient market data');
    });

    it('rejects when avgVolume < 100000', () => {
      const lowAvg = { ...validStock, avgVolume: 80000 };
      const res = EntryManagerService.evaluateEligibility(lowAvg, 1510, 20000, true);
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /avgVolume/);
    });

    it('rejects when volume < 100000', () => {
      const lowVol = { ...validStock, volume: 50000 };
      const res = EntryManagerService.evaluateEligibility(lowVol, 1510, 20000, true);
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /volume/);
    });

    it('rejects when volumeRatio < BREAKOUT_RATIO', () => {
      const lowRatio = { ...validStock, volume: 105000, avgVolume: 500000 }; // ratio ~0.21 < 1.5
      const res = EntryManagerService.evaluateEligibility(lowRatio, 1510, 20000, true);
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /volumeRatio/);
    });

    it('rejects when intradayVolume < 5000', () => {
      const res = EntryManagerService.evaluateEligibility(validStock, 1510, 2000, true);
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /intradayVolume/);
    });

    it('approves eligible stock with healthy volume and intraday', () => {
      const res = EntryManagerService.evaluateEligibility(validStock, 1510, 25000, true);
      assert.equal(res.eligible, true);
      assert.equal(res.reason, null);
    });
  });

  describe('resolvePreviousClose', () => {
    it('returns stock.previousClose when asOfDate is not provided', () => {
      const prev = EntryManagerService.resolvePreviousClose(validStock);
      assert.equal(prev, 1500);
    });

    it('resolves prior date close when target date is matched in history', () => {
      const prev = EntryManagerService.resolvePreviousClose(validStock, '2026-09-08');
      assert.equal(prev, 1495);
    });

    it('returns last bar close if today is not in history', () => {
      const prev = EntryManagerService.resolvePreviousClose({
        ...validStock,
        previousClose: 0,
      }, '2026-09-09');
      assert.equal(prev, 1500);
    });

    it('returns null if history is empty and previousClose is missing', () => {
      const emptyStock: MarketStockData = {
        ...validStock,
        symbol: 'UNKNOWN',
        close: 100,
        previousClose: 0,
        history: [],
      };
      const prev = EntryManagerService.resolvePreviousClose(emptyStock, '2026-09-09');
      assert.equal(prev, null);
    });
  });

  describe('evaluateExtension', () => {
    it('approves when stock has normal day return within limits', () => {
      const normalStock: MarketStockData = {
        ...validStock,
        ltp: 1515, // +1% vs 1500
        high: 1520,
        low: 1495,
      };
      const res = EntryManagerService.evaluateExtension(normalStock, 'LONG');
      assert.equal(res.eligible, true);
    });

    it('rejects LONG when day return exceeds MAX_DAY_RETURN_PCT', () => {
      const verticalUp: MarketStockData = {
        ...validStock,
        ltp: 1575, // +5% vs 1500 > 3.5%
        high: 1580,
        low: 1495,
      };
      const res = EntryManagerService.evaluateExtension(verticalUp, 'LONG');
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /EXTENDED_UP/);
    });

    it('rejects SHORT when day drop exceeds MAX_DAY_DROP_PCT', () => {
      const verticalDown: MarketStockData = {
        ...validStock,
        ltp: 1420, // -5.3% vs 1500 < -3.5%
        high: 1505,
        low: 1415,
      };
      const res = EntryManagerService.evaluateExtension(verticalDown, 'SHORT');
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /EXTENDED_DOWN/);
    });

    it('returns eligible: true when previous close cannot be resolved', () => {
      const noPrevStock: MarketStockData = {
        ...validStock,
        symbol: 'TEST',
        ltp: 100,
        high: 105,
        low: 95,
        previousClose: 0,
        history: [],
      };
      const res = EntryManagerService.evaluateExtension(noPrevStock, 'LONG', '2026-09-09');
      assert.equal(res.eligible, true);
      assert.equal(res.reason, null);
    });

    it('rejects when OHLC data is missing', () => {
      const noHighLow = {
        ...validStock,
        symbol: 'TEST',
        ltp: 100,
        high: undefined as any,
        low: undefined as any,
      } as unknown as MarketStockData;
      const res = EntryManagerService.evaluateExtension(noHighLow, 'LONG');
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /Insufficient OHLC/);
    });

    it('rejects LONG when day return exceeds ATR multiple cap', () => {
      // True range = 1002.5 - 997.5 = 5.0 -> ATR = 5.0 -> ATR% on 1000 = 0.5%.
      // 2.0x ATR cap = 1.0%. Day return of 2.5% (ltp 1025) is < 3.5% flat cap but > 1.0% ATR cap.
      const tightAtrStock: MarketStockData = {
        ...validStock,
        ltp: 1025,
        high: 1026,
        low: 998,
        previousClose: 1000,
        history: Array.from({ length: 15 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          open: 1000,
          high: 1002.5,
          low: 997.5,
          close: 1000,
          volume: 500000,
        })),
      };
      const res = EntryManagerService.evaluateExtension(tightAtrStock, 'LONG');
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /EXTENDED_UP/);
    });

    it('rejects LONG when day range exceeds ATR range multiple cap', () => {
      // Day return is small (0.5%), but range is huge (high - low = 40 on 1000 = 4% >= 2.5 * ATR)
      const wideRangeStock: MarketStockData = {
        ...validStock,
        ltp: 1005,
        high: 1040,
        low: 995,
        previousClose: 1000,
        history: Array.from({ length: 15 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          open: 1000,
          high: 1005,
          low: 995,
          close: 1000,
          volume: 500000,
        })),
      };
      const res = EntryManagerService.evaluateExtension(wideRangeStock, 'LONG');
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /EXTENDED_RANGE/);
    });

    it('rejects SHORT when drop exceeds ATR multiple cap', () => {
      // ATR% = 0.5%. Drop of -2.5% (ltp 975) is > -3.5% flat drop cap but <= -1.0% ATR cap.
      const tightAtrStock: MarketStockData = {
        ...validStock,
        ltp: 975, // -2.5%
        high: 1002,
        low: 974,
        previousClose: 1000,
        history: Array.from({ length: 15 }, (_, i) => ({
          date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          open: 1000,
          high: 1002.5,
          low: 997.5,
          close: 1000,
          volume: 500000,
        })),
      };
      const res = EntryManagerService.evaluateExtension(tightAtrStock, 'SHORT');
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /EXTENDED_DOWN/);
    });
  });

  describe('evaluateBreakoutConflict', () => {
    it('approves when no scanner conflict exists', () => {
      const res = EntryManagerService.evaluateBreakoutConflict(validStock, 'LONG', ['BREAKOUT']);
      assert.equal(res.eligible, true);
      assert.equal(res.reason, null);
    });

    it('rejects LONG when confirmed BREAKDOWN signal exists', () => {
      const res = EntryManagerService.evaluateBreakoutConflict(validStock, 'LONG', ['BREAKDOWN']);
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /SCANNER_BREAKDOWN_CONFLICT/);
    });

    it('rejects SHORT when confirmed BREAKOUT signal exists', () => {
      const res = EntryManagerService.evaluateBreakoutConflict(validStock, 'SHORT', ['BREAKOUT']);
      assert.equal(res.eligible, false);
      assert.match(res.reason ?? '', /SCANNER_BREAKOUT_CONFLICT/);
    });
  });
});
