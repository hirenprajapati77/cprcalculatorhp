import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../../lib/db';
import { GET } from '../../app/api/scanner/route';
import { EventCalendarService } from '../../services/overnight/event.service';
import { OptionSuggestionService } from '../../services/option-suggestion.service';

describe('Scanner API Heatmap & KPI Parity', () => {
  it('ensures server-side heatmap sectors count matches global KPI counts', async () => {
    // 1. Save original Prisma, Event Service, and Option Suggestion methods
    const originalSnapshotFindMany = prisma.marketSnapshot.findMany;
    const originalResultFindMany = prisma.scannerResult.findMany;
    const originalResultCount = prisma.scannerResult.count;
    const originalResultFindFirst = prisma.scannerResult.findFirst;
    const originalHistoryFindFirst = prisma.scanHistory.findFirst;
    const originalGetBulkEventRisk = EventCalendarService.getBulkEventRisk;
    const originalSuggestOption = OptionSuggestionService.suggestOption;

    // Mock option suggestions to avoid database queries during live testing window
    OptionSuggestionService.suggestOption = async () => ({ error: 'MOCKED_IN_TEST' });

    // 2. Setup mock data
    const mockSnapshots = [
      { id: 1, symbol: 'TEST_IT', sector: 'IT', marketCap: 50000, avgVolume: 1000000, sessionOpen: 100, price: 101, previousClose: 100, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, symbol: 'TEST_FIN', sector: 'Financial Services', marketCap: 50000, avgVolume: 1000000, sessionOpen: 100, price: 101, previousClose: 100, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, symbol: 'TEST_OTHER', sector: 'Other', marketCap: 50000, avgVolume: 1000000, sessionOpen: 100, price: 101, previousClose: 100, createdAt: new Date(), updatedAt: new Date() }
    ];

    const mockResults = [
      { id: 1, symbol: 'TEST_IT', date: '2026-08-11', score: 78, signalSummary: 'BULLISH,ABOVE_VWAP', ltp: 101, volume: 100000, width: 0.5, entry: 100, sl: 98, target: 104, rr: '1:2', classification: 'NORMAL', createdAt: new Date(), updatedAt: new Date() },
      { id: 2, symbol: 'TEST_FIN', date: '2026-08-11', score: 65, signalSummary: 'BULLISH', ltp: 101, volume: 100000, width: 0.5, entry: 100, sl: 98, target: 104, rr: '1:2', classification: 'NORMAL', createdAt: new Date(), updatedAt: new Date() },
      { id: 3, symbol: 'TEST_OTHER', date: '2026-08-11', score: 35, signalSummary: 'BEARISH', ltp: 101, volume: 100000, width: 0.5, entry: 100, sl: 98, target: 104, rr: '1:2', classification: 'NORMAL', createdAt: new Date(), updatedAt: new Date() }
    ];

    // 3. Apply mock implementations
    prisma.marketSnapshot.findMany = (async () => mockSnapshots) as any;
    prisma.scannerResult.count = (async () => mockResults.length) as any;
    prisma.scanHistory.findFirst = (async () => ({ createdAt: new Date() })) as any;
    prisma.scannerResult.findFirst = (async () => ({ createdAt: new Date() })) as any;
    EventCalendarService.getBulkEventRisk = (async () => ({})) as any;

    // Direct mock for finder: handle both paginated results and fullStats
    prisma.scannerResult.findMany = (async (args: any) => {
      if (args && args.select) {
        // fullStats call
        return mockResults.map(r => ({
          symbol: r.symbol,
          score: r.score,
          signalSummary: r.signalSummary
        }));
      }
      // paginated results call
      return mockResults;
    }) as any;

    try {
      // 4. Construct Request and execute GET
      const req = new NextRequest('http://localhost:3000/api/scanner?universe=NIFTY50&market=NSE');
      const response = await GET(req);
      assert.strictEqual(response.status, 200);

      const body = await response.json();
      assert.ok(body.success);
      assert.ok(body.insights);
      assert.ok(body.insights.heatmapSectors);

      const insights = body.insights;
      const heatmap = insights.heatmapSectors;

      // 5. Verify parity of global KPIs with heatmap sector totals
      let heatmapStrongBuy = 0;
      let heatmapBreakoutReady = 0;
      let symbolFound = false;
      let topStockFound = false;

      for (const sector of Object.keys(heatmap)) {
        const strongBuyCell = heatmap[sector].strongBuy;
        const breakoutCell = heatmap[sector].breakout;

        heatmapStrongBuy += strongBuyCell.count;
        heatmapBreakoutReady += breakoutCell.count;

        if (strongBuyCell.count > 0) {
          assert.ok(Array.isArray(strongBuyCell.symbols), 'symbols must be an array');
          if (strongBuyCell.symbols.length > 0) {
            symbolFound = true;
          }
          if (strongBuyCell.topStock && strongBuyCell.topStock !== '') {
            topStockFound = true;
          }
        }
        if (breakoutCell.count > 0) {
          assert.ok(Array.isArray(breakoutCell.symbols), 'symbols must be an array');
          if (breakoutCell.symbols.length > 0) {
            symbolFound = true;
          }
          if (breakoutCell.topStock && breakoutCell.topStock !== '') {
            topStockFound = true;
          }
        }
      }

      // Parity assertions
      assert.strictEqual(insights.strongBuy, 1, 'Strong Buy KPI count matches');
      assert.strictEqual(insights.breakoutReady, 1, 'Breakout Ready KPI count matches');
      
      // Check specific breakout count parity directly
      assert.strictEqual(heatmapStrongBuy, insights.strongBuy, 'Strong Buy heatmap sum matches KPI count');
      assert.strictEqual(heatmapBreakoutReady, insights.breakoutReady, 'Breakout Ready heatmap sum matches KPI count');

      // Assert that detailed cell details are correctly populated
      assert.ok(symbolFound, 'At least one cell has symbols list populated');
      assert.ok(topStockFound, 'At least one cell has topStock populated');
    } finally {
      // 6. Restore original Prisma and Event methods
      prisma.marketSnapshot.findMany = originalSnapshotFindMany;
      prisma.scannerResult.findMany = originalResultFindMany;
      prisma.scannerResult.count = originalResultCount;
      prisma.scannerResult.findFirst = originalResultFindFirst;
      prisma.scanHistory.findFirst = originalHistoryFindFirst;
      EventCalendarService.getBulkEventRisk = originalGetBulkEventRisk;
      OptionSuggestionService.suggestOption = originalSuggestOption;
    }
  });
});
