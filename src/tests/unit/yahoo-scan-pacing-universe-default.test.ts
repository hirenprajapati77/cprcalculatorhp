import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { env } from '../../config/env';
import { MarketService } from '../../services/market.service';
import { ScannerController } from '../../services/scanner-controller';
import { EventCalendarService } from '../../services/overnight/event.service';
import { BullishStateService } from '../../services/bullish-state.service';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { DatabaseCircuitBreaker, CircuitState } from '../../lib/circuit-breaker';
import { GET as getScannerRoute } from '../../app/api/scanner/route';
import { POST as postRefreshRoute } from '../../app/api/scanner/refresh/route';
import { prisma } from '../../lib/db';

describe('Yahoo Fallback Scan Pacing + Scanner Universe Default Consistency', () => {
  beforeEach(() => {
    // Reset circuit breaker state before each test
    (DatabaseCircuitBreaker as unknown as { state: CircuitState }).state = CircuitState.CLOSED;
    (DatabaseCircuitBreaker as unknown as { nextAttemptAt: number }).nextAttemptAt = 0;
  });

  describe('Item 1: Yahoo fallback scan pacing in ScannerController', () => {
    it('applies YAHOO_SCAN_BATCH_DELAY_MS between batches of size 2 when Fyers is on cooldown', async () => {
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

      // Force Fyers cooldown active
      MarketService.isFyersTemporarilyUnavailable = () => true;
      MarketService.prefetchFyersQuotes = async () => ({ seeded: 0, batches: 0 });
      EventCalendarService.getBulkEventRisk = async () => ({});
      ScannerController.persistScanResults = (async () => {}) as unknown as typeof ScannerController.persistScanResults;
      BullishStateService.recordState = (async () => null) as unknown as typeof BullishStateService.recordState;
      BullishStateService.clearState = async () => {};

      // 5 mock stocks: with batchSize=2 -> 3 batches (2, 2, 1), so 2 delays between batches
      const mockUniverse = [
        { symbol: 'SYM1', name: 'SYM1', sector: 'TEST', marketCap: 'LARGE' },
        { symbol: 'SYM2', name: 'SYM2', sector: 'TEST', marketCap: 'LARGE' },
        { symbol: 'SYM3', name: 'SYM3', sector: 'TEST', marketCap: 'LARGE' },
        { symbol: 'SYM4', name: 'SYM4', sector: 'TEST', marketCap: 'LARGE' },
        { symbol: 'SYM5', name: 'SYM5', sector: 'TEST', marketCap: 'LARGE' },
      ];
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
        assert.equal(results.length, 5);

        // Verify delay count and duration
        const expectedDelay = env.YAHOO_SCAN_BATCH_DELAY_MS;
        const matchingDelays = delaysRecorded.filter((d) => d === expectedDelay);
        // For 5 items with batch size 2: 3 batches -> exactly 2 inter-batch delays (no delay after final batch)
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

    it('does not apply Yahoo pacing delay when Fyers is healthy (healthy path unchanged)', async () => {
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

      const mockUniverse = [
        { symbol: 'SYM1', name: 'SYM1', sector: 'TEST', marketCap: 'LARGE' },
        { symbol: 'SYM2', name: 'SYM2', sector: 'TEST', marketCap: 'LARGE' },
        { symbol: 'SYM3', name: 'SYM3', sector: 'TEST', marketCap: 'LARGE' },
      ];
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
        assert.equal(results.length, 3);

        const expectedDelay = env.YAHOO_SCAN_BATCH_DELAY_MS;
        const matchingDelays = delaysRecorded.filter((d) => d === expectedDelay);
        assert.equal(matchingDelays.length, 0, 'Healthy Fyers path must not apply Yahoo pacing delay');
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

  describe('Item 2: Scanner Universe Default Consistency', () => {
    it('GET /api/scanner without universe param defaults to NIFTY_FNO (full F&O size, not Nifty 50)', async () => {
      OptionSuggestionService.suggestOption = async () => ({ error: 'MOCKED' });

      const origMarketSnapshotFindMany = prisma.marketSnapshot.findMany;
      const origScannerResultCount = prisma.scannerResult.count;
      const origScanHistoryFindFirst = prisma.scanHistory.findFirst;
      const origScannerResultFindFirst = prisma.scannerResult.findFirst;
      const origScannerResultFindMany = prisma.scannerResult.findMany;
      const origGetBulkEventRisk = EventCalendarService.getBulkEventRisk;

      prisma.marketSnapshot.findMany = (async () => []) as unknown as typeof prisma.marketSnapshot.findMany;
      prisma.scannerResult.count = (async () => 0) as unknown as typeof prisma.scannerResult.count;
      prisma.scanHistory.findFirst = (async () => null) as unknown as typeof prisma.scanHistory.findFirst;
      prisma.scannerResult.findFirst = (async () => null) as unknown as typeof prisma.scannerResult.findFirst;
      prisma.scannerResult.findMany = (async () => []) as unknown as typeof prisma.scannerResult.findMany;
      EventCalendarService.getBulkEventRisk = (async () => ({})) as unknown as typeof EventCalendarService.getBulkEventRisk;

      try {
        // 1. Request with omitted universe
        const reqOmitted = new NextRequest('http://localhost:3000/api/scanner?market=NSE');
        const resOmitted = await getScannerRoute(reqOmitted);
        assert.strictEqual(resOmitted.status, 200);

        const bodyOmitted = (await resOmitted.json()) as { success: boolean; universeCount: number };
        assert.ok(bodyOmitted.success);
        const expectedFnoCount = MarketService.getUniverseCount('NIFTY_FNO');
        assert.ok(expectedFnoCount > 150, `Expected full F&O count > 150, got ${expectedFnoCount}`);
        assert.strictEqual(
          bodyOmitted.universeCount,
          expectedFnoCount,
          `Omitted universe param must default to NIFTY_FNO size (${expectedFnoCount}), got ${bodyOmitted.universeCount}`
        );

        // 2. Explicit NIFTY50 request still works and returns 50
        const reqExplicit50 = new NextRequest('http://localhost:3000/api/scanner?universe=NIFTY50&market=NSE');
        const resExplicit50 = await getScannerRoute(reqExplicit50);
        assert.strictEqual(resExplicit50.status, 200);

        const bodyExplicit50 = (await resExplicit50.json()) as { success: boolean; universeCount: number };
        assert.ok(bodyExplicit50.success);
        assert.strictEqual(bodyExplicit50.universeCount, 50);
      } finally {
        prisma.marketSnapshot.findMany = origMarketSnapshotFindMany;
        prisma.scannerResult.count = origScannerResultCount;
        prisma.scanHistory.findFirst = origScanHistoryFindFirst;
        prisma.scannerResult.findFirst = origScannerResultFindFirst;
        prisma.scannerResult.findMany = origScannerResultFindMany;
        EventCalendarService.getBulkEventRisk = origGetBulkEventRisk;
      }
    });

    it('POST /api/scanner/refresh without universe in body defaults to NIFTY_FNO', async () => {
      const origRunFullScan = ScannerController.runFullScan;
      const origFindMany = prisma.scannerResult.findMany;
      const origFindFirst = prisma.scannerResult.findFirst;

      let scannedUniverse: string | undefined;
      ScannerController.runFullScan = (async (u: unknown) => {
        scannedUniverse = u as string;
        return [];
      }) as unknown as typeof ScannerController.runFullScan;

      prisma.scannerResult.findFirst = (async () => ({ date: '2026-11-13' })) as unknown as typeof prisma.scannerResult.findFirst;
      prisma.scannerResult.findMany = (async () => []) as unknown as typeof prisma.scannerResult.findMany;

      try {
        const req = new NextRequest('http://localhost:3000/api/scanner/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ market: 'NSE', bypass: true }), // universe omitted, bypass ensures execution
        });

        const res = await postRefreshRoute(req);
        assert.strictEqual(res.status, 202);
        const body = (await res.json()) as { success: boolean };
        assert.strictEqual(body.success, true);
        assert.strictEqual(scannedUniverse, 'NIFTY_FNO');
      } finally {
        ScannerController.runFullScan = origRunFullScan;
        prisma.scannerResult.findMany = origFindMany;
        prisma.scannerResult.findFirst = origFindFirst;
      }
    });

    it('GET /api/btst without universe query param defaults to NIFTY_FNO', async () => {
      const { GET: getBtstRoute } = await import('../../app/api/btst/route');
      const { BtstService } = await import('../../services/backtest/btst.service');
      const { CacheService } = await import('../../services/cache.service');

      const origDiscover = BtstService.discover;
      const origCacheGet = CacheService.get;
      const origWindowOpen = BtstService.isExecutionWindowOpen;

      let discoveredUniverse: string | undefined;
      BtstService.discover = (async (u: string) => {
        discoveredUniverse = u;
        return {
          results: [],
          insights: {
            strongSignal: 0,
            breakoutReady: 0,
            avoid: 0,
            totalLong: 0,
            totalShort: 0,
            totalConflict: 0,
          },
        };
      }) as unknown as typeof BtstService.discover;

      CacheService.get = (async () => null) as unknown as typeof CacheService.get;
      BtstService.isExecutionWindowOpen = () => true;

      try {
        const reqOmitted = new NextRequest('http://localhost:3000/api/btst?bypass=true');
        const resOmitted = await getBtstRoute(reqOmitted);
        assert.strictEqual(resOmitted.status, 200);
        assert.strictEqual(discoveredUniverse, 'NIFTY_FNO');
      } finally {
        BtstService.discover = origDiscover;
        CacheService.get = origCacheGet;
        BtstService.isExecutionWindowOpen = origWindowOpen;
      }
    });
  });
});
