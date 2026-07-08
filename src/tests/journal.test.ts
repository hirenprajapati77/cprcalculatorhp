import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/db';
import { TradeJournalService } from '../services/journal/trade-journal.service';
import { JournalReportService } from '../services/reporting/journal-report.service';

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
});
