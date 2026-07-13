import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/db';
import { TradeJournalService } from '../services/journal/trade-journal.service';

test('TradeJournalService Phase 3', async (t) => {
  await t.test('Classifies EXECUTION_SLIPPAGE correctly', async () => {
    // 1. Setup mock trade in DB
    const mockId = 'test-trade-1';
    await prisma.tradeJournal.create({
      data: {
        id: mockId,
        tradeDate: new Date(),
        signalType: 'BTST',
        symbol: 'RELIANCE',
        optionContract: 'RELIANCE 2500 CE',
        optionStrike: 2500,
        optionType: 'CE',
        entryCmp: 100,
        entryTime: new Date(),
        exitCmp: 80,
        pnl: -20,
        pnlPct: -20,
        score: 90,
        confidence: 80,
        signalSummary: 'LONG',
        qualityBucketAtSignal: 'TRADEABLE', // Good signal
      }
    });

    // 2. Classify
    await TradeJournalService.classifyExecutionOutcome(mockId);

    // 3. Verify
    const updated = await prisma.tradeJournal.findUnique({ where: { id: mockId } });
    assert.strictEqual(updated?.executionOutcome, 'EXECUTION_SLIPPAGE');

    // 4. Cleanup
    await prisma.tradeJournal.delete({ where: { id: mockId } });
  });

  await t.test('Classifies EVENT_RISK_AVOIDABLE correctly', async () => {
    const mockId = 'test-trade-2';
    await prisma.tradeJournal.create({
      data: {
        id: mockId,
        tradeDate: new Date(),
        signalType: 'BTST',
        symbol: 'TCS',
        optionContract: 'TCS 3500 CE',
        optionStrike: 3500,
        optionType: 'CE',
        entryCmp: 100,
        entryTime: new Date(),
        exitCmp: 80,
        pnl: -20,
        pnlPct: -20,
        score: 90,
        confidence: 80,
        signalSummary: 'LONG',
        qualityBucketAtSignal: 'TRADEABLE',
        eventRiskScoreAtSignal: 80, // High risk
      }
    });

    await TradeJournalService.classifyExecutionOutcome(mockId);
    const updated = await prisma.tradeJournal.findUnique({ where: { id: mockId } });
    assert.strictEqual(updated?.executionOutcome, 'EVENT_RISK_AVOIDABLE');
    await prisma.tradeJournal.delete({ where: { id: mockId } });
  });

  await t.test('getStats calculates totalAllTrades and totalClosedTrades correctly', async () => {
    // 1. Mock Prisma to return specific counts and entries
    const originalCount = prisma.tradeJournal.count;
    const originalFindMany = prisma.tradeJournal.findMany;
    
    // @ts-expect-error Mocking Prisma for tests
    prisma.tradeJournal.count = async () => 5;
    
    // @ts-expect-error Mocking Prisma for tests
    prisma.tradeJournal.findMany = async () => {
      return [
        { id: '1', signalType: 'CPR', pnl: 100, pnlPct: 10 },
        { id: '2', signalType: 'CPR', pnl: -50, pnlPct: -5 },
        { id: '3', signalType: 'BTST', pnl: 200, pnlPct: 20 },
        // 2 Open Trades (no PnL yet)
        { id: '4', signalType: 'STBT', pnl: null, pnlPct: null },
        { id: '5', signalType: 'BTST', pnl: null, pnlPct: null },
      ];
    };

    // 2. Call the service
    const result = await TradeJournalService.getEntries({ page: 1, limit: 10, signalType: 'ALL' });

    // 3. Verify math
    assert.strictEqual(result.stats.totalAllTrades, 5, 'totalAllTrades should count all trades, including open ones');
    assert.strictEqual(result.stats.totalClosedTrades, 3, 'totalClosedTrades should only count trades with PnL');
    assert.strictEqual(result.stats.totalTrades, 3, 'totalTrades should equal closed.length for backward compatibility');
    assert.strictEqual(result.stats.winners, 2, 'winners should only count trades with pnl > 0');
    
    // 4. Restore Prisma
    prisma.tradeJournal.count = originalCount;
    prisma.tradeJournal.findMany = originalFindMany;
  });

  await t.test('previousTradingDayMidnightIST resolves Monday to prior Friday', async () => {
    // 2026-06-29 is a Monday
    const monday = new Date(Date.UTC(2026, 5, 29, 6, 0, 0)); // 11:30 AM IST
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (TradeJournalService as any).previousTradingDayMidnightIST(monday) as Date;
    
    // Should resolve to 2026-06-26 (Friday) midnight IST, which is 2026-06-25 18:30:00 UTC
    assert.strictEqual(result.getUTCFullYear(), 2026);
    assert.strictEqual(result.getUTCMonth(), 5); // 0-indexed, so 5 = June
    assert.strictEqual(result.getUTCDate(), 25);
    assert.strictEqual(result.getUTCHours(), 18);
    assert.strictEqual(result.getUTCMinutes(), 30);
  });
});
