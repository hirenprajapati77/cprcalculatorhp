import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../config/env';
import { MarketService } from '../../services/market.service';
import { ScannerController } from '../../services/scanner-controller';
import { EventCalendarService } from '../../services/overnight/event.service';
import { BullishStateService } from '../../services/bullish-state.service';
import { OvernightService } from '../../services/overnight/overnight.service';
import { FyersAuthService } from '../../services/fyers-auth.service';

describe('A1: Fyers Per-Symbol History & Overnight Prefetch Pacing', () => {
  describe('ScannerController Fyers-Primary History Pacing', () => {
    it('applies FYERS_BATCH_DELAY_MS between batches of size 5 when Fyers is healthy', async () => {
      const origIsFyers = MarketService.isFyersTemporarilyUnavailable;
      const origPrefetch = MarketService.prefetchFyersQuotes;
      const origGetUniverse = MarketService.getUniverse;
      const origGetStock = MarketService.getStockData;
      const origEventRisk = EventCalendarService.getBulkEventRisk;
      const origPersist = ScannerController.persistScanResults;
      const origRecordState = BullishStateService.recordState;
      const origClearState = BullishStateService.clearState;
      const origSetTimeout = globalThis.setTimeout;

      const delaysRecorded: number[] = [];

      globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
        if (typeof ms === 'number') {
          delaysRecorded.push(ms);
        }
        return origSetTimeout(fn, 0, ...args);
      }) as typeof setTimeout;

      // Fyers healthy
      MarketService.isFyersTemporarilyUnavailable = () => false;
      MarketService.prefetchFyersQuotes = async () => ({ seeded: 0, batches: 0 });
      EventCalendarService.getBulkEventRisk = async () => ({});
      ScannerController.persistScanResults = (async () => {}) as unknown as typeof ScannerController.persistScanResults;
      BullishStateService.recordState = (async () => null) as unknown as typeof BullishStateService.recordState;
      BullishStateService.clearState = async () => {};

      // 12 stocks with batchSize=5 -> 3 batches (5, 5, 2) -> exactly 2 delays
      const mockUniverse = Array.from({ length: 12 }, (_, i) => ({
        symbol: `SYM_${i + 1}`,
        name: `SYM_${i + 1}`,
        sector: 'TEST',
        marketCap: 'LARGE',
      }));
      MarketService.getUniverse = (() => mockUniverse) as unknown as typeof MarketService.getUniverse;

      MarketService.getStockData = (async (sym: string) => ({
        symbol: sym,
        market: 'NSE',
        ltp: 100,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 10000,
        prevClose: 99,
      })) as unknown as typeof MarketService.getStockData;

      try {
        const results = await ScannerController.runFullScan('NIFTY_FNO', 'NSE');
        assert.equal(results.length, 12);

        const expectedDelay = env.FYERS_BATCH_DELAY_MS;
        const matchingDelays = delaysRecorded.filter((d) => d === expectedDelay);
        // 12 items / 5 per batch = 3 batches -> exactly 2 delays between batches, 0 after final
        assert.equal(
          matchingDelays.length,
          2,
          `Expected 2 delays of ${expectedDelay}ms between 3 batches, got ${matchingDelays.length}`
        );
      } finally {
        MarketService.isFyersTemporarilyUnavailable = origIsFyers;
        MarketService.prefetchFyersQuotes = origPrefetch;
        MarketService.getUniverse = origGetUniverse;
        MarketService.getStockData = origGetStock;
        EventCalendarService.getBulkEventRisk = origEventRisk;
        ScannerController.persistScanResults = origPersist;
        BullishStateService.recordState = origRecordState;
        BullishStateService.clearState = origClearState;
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it('does not delay after the final batch', async () => {
      const origIsFyers = MarketService.isFyersTemporarilyUnavailable;
      const origPrefetch = MarketService.prefetchFyersQuotes;
      const origGetUniverse = MarketService.getUniverse;
      const origGetStock = MarketService.getStockData;
      const origEventRisk = EventCalendarService.getBulkEventRisk;
      const origPersist = ScannerController.persistScanResults;
      const origRecordState = BullishStateService.recordState;
      const origClearState = BullishStateService.clearState;
      const origSetTimeout = globalThis.setTimeout;

      const delaysRecorded: number[] = [];

      globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
        if (typeof ms === 'number') {
          delaysRecorded.push(ms);
        }
        return origSetTimeout(fn, 0, ...args);
      }) as typeof setTimeout;

      MarketService.isFyersTemporarilyUnavailable = () => false;
      MarketService.prefetchFyersQuotes = async () => ({ seeded: 0, batches: 0 });
      EventCalendarService.getBulkEventRisk = async () => ({});
      ScannerController.persistScanResults = (async () => {}) as unknown as typeof ScannerController.persistScanResults;
      BullishStateService.recordState = (async () => null) as unknown as typeof BullishStateService.recordState;
      BullishStateService.clearState = async () => {};

      // Exactly 1 batch (4 stocks <= 5) -> 0 delays
      const mockUniverse = Array.from({ length: 4 }, (_, i) => ({
        symbol: `SYM_${i + 1}`,
        name: `SYM_${i + 1}`,
        sector: 'TEST',
        marketCap: 'LARGE',
      }));
      MarketService.getUniverse = (() => mockUniverse) as unknown as typeof MarketService.getUniverse;

      MarketService.getStockData = (async (sym: string) => ({
        symbol: sym,
        market: 'NSE',
        ltp: 100,
        open: 99,
        high: 101,
        low: 98,
        close: 100,
        volume: 10000,
        prevClose: 99,
      })) as unknown as typeof MarketService.getStockData;

      try {
        const results = await ScannerController.runFullScan('NIFTY_FNO', 'NSE');
        assert.equal(results.length, 4);

        const expectedDelay = env.FYERS_BATCH_DELAY_MS;
        const matchingDelays = delaysRecorded.filter((d) => d === expectedDelay);
        assert.equal(matchingDelays.length, 0, 'Single batch must produce 0 delays');
      } finally {
        MarketService.isFyersTemporarilyUnavailable = origIsFyers;
        MarketService.prefetchFyersQuotes = origPrefetch;
        MarketService.getUniverse = origGetUniverse;
        MarketService.getStockData = origGetStock;
        EventCalendarService.getBulkEventRisk = origEventRisk;
        ScannerController.persistScanResults = origPersist;
        BullishStateService.recordState = origRecordState;
        BullishStateService.clearState = origClearState;
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });

  describe('OvernightService Stock-Data Prefetch Chunk Pacing', () => {
    it('applies FYERS_BATCH_DELAY_MS between chunks of size 8 during overnight discovery', async () => {
      const origGetUniverse = MarketService.getUniverse;
      const origPrefetchQuotes = MarketService.prefetchFyersQuotes;
      const origGetStock = MarketService.getStockData;
      const origGetBulkEvent = EventCalendarService.getBulkEventRisk;
      const origGetMacroEvent = EventCalendarService.getMacroEventRisk;
      const origGetIntraday = OvernightService.getIntradayData;
      const origSetTimeout = globalThis.setTimeout;

      const delaysRecorded: number[] = [];

      globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
        if (typeof ms === 'number') {
          delaysRecorded.push(ms);
        }
        return origSetTimeout(fn, 0, ...args);
      }) as typeof setTimeout;

      MarketService.prefetchFyersQuotes = async () => ({ seeded: 0, batches: 0 });
      EventCalendarService.getBulkEventRisk = async () => ({});
      EventCalendarService.getMacroEventRisk = async () => ({ severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'UNKNOWN' });

      // 18 symbols / chunk 8 = 3 chunks (8, 8, 2) -> exactly 2 delays between chunks
      const mockSymbols = Array.from({ length: 18 }, (_, i) => ({
        symbol: `OVN_${i + 1}`,
        name: `OVN_${i + 1}`,
        sector: 'TEST',
        marketCap: 'LARGE',
        isFnO: true,
      }));
      MarketService.getUniverse = (() => mockSymbols) as unknown as typeof MarketService.getUniverse;

      MarketService.getStockData = (async (sym: string) => ({
        symbol: sym,
        market: 'NSE',
        ltp: 200,
        open: 195,
        high: 205,
        low: 190,
        close: 200,
        volume: 500000,
        avgVolume: 300000,
        prevClose: 195,
        prevVolume: 400000,
        dailyHistory: [],
      })) as unknown as typeof MarketService.getStockData;

      OvernightService.getIntradayData = async () => ({
        vwap: 200,
        intradayVolume: 500000,
        last15mHigh: 205,
        last15mLow: 190,
        hasIntraday: true,
      });

      try {
        await OvernightService.discover('BOTH', new Date('2026-11-13T09:45:00.000Z'));

        const expectedDelay = env.FYERS_BATCH_DELAY_MS;
        const matchingDelays = delaysRecorded.filter((d) => d === expectedDelay);
        assert.equal(
          matchingDelays.length,
          2,
          `Expected 2 chunk delays of ${expectedDelay}ms between 3 chunks, got ${matchingDelays.length}`
        );
      } finally {
        MarketService.getUniverse = origGetUniverse;
        MarketService.prefetchFyersQuotes = origPrefetchQuotes;
        MarketService.getStockData = origGetStock;
        EventCalendarService.getBulkEventRisk = origGetBulkEvent;
        EventCalendarService.getMacroEventRisk = origGetMacroEvent;
        OvernightService.getIntradayData = origGetIntraday;
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });

  describe('B6: Fyers Quotes Batch Index Guard', () => {
    it('uses indexed loop to pace chunks without indexOf lookup', async () => {
      const origFetchWithTimeout = MarketService['fetchWithTimeout'];
      const origAuth = FyersAuthService.getAccessToken;
      const origCreds = FyersAuthService.getCredentials;
      const origSetTimeout = globalThis.setTimeout;

      const delaysRecorded: number[] = [];

      globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
        if (typeof ms === 'number') {
          delaysRecorded.push(ms);
        }
        return origSetTimeout(fn, 0, ...args);
      }) as typeof setTimeout;

      FyersAuthService.getAccessToken = async () => 'test_token';
      FyersAuthService.getCredentials = () => ({ appId: 'test_app_id', secretId: 'test_secret_id', redirectUrl: 'https://redirect' });

      MarketService['fetchWithTimeout'] = (async () => ({
        status: 200,
        ok: true,
        json: async () => ({ s: 'ok', d: [] }),
      })) as unknown as typeof MarketService['fetchWithTimeout'];

      try {
        // 120 symbols / 50 per batch = 3 batches -> exactly 2 pacing delays
        const symbols = Array.from({ length: 120 }, (_, i) => `SYM_${i + 1}`);
        const res = await MarketService.prefetchFyersQuotes(symbols, 'NSE');
        assert.equal(res.batches, 3);

        const expectedDelay = env.FYERS_BATCH_DELAY_MS;
        const matchingDelays = delaysRecorded.filter((d) => d === expectedDelay);
        assert.equal(
          matchingDelays.length,
          2,
          `Expected 2 delays between 3 quote batches, got ${matchingDelays.length}`
        );
      } finally {
        MarketService['fetchWithTimeout'] = origFetchWithTimeout;
        FyersAuthService.getAccessToken = origAuth;
        FyersAuthService.getCredentials = origCreds;
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });
});
