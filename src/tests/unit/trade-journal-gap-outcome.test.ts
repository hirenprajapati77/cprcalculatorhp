import test from 'node:test';
import assert from 'node:assert/strict';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { prisma } from '@/lib/db';

test('underlying journal leg helpers', () => {
  assert.equal(TradeJournalService.underlyingOptionContract('CE'), 'UNDERLYING CE');
  assert.equal(TradeJournalService.underlyingOptionContract('PE'), 'UNDERLYING PE');
  assert.equal(TradeJournalService.isUnderlyingJournalLeg('UNDERLYING CE'), true);
  assert.equal(TradeJournalService.isUnderlyingJournalLeg('1920 CE'), false);
});

test('classifyExecutionOutcome uses exitCmp when cmp916 is missing (early exit gap)', async () => {
  const originalFind = prisma.tradeJournal.findUnique;
  const originalUpdate = prisma.tradeJournal.update;
  let outcomeWritten: string | null = null;

  // @ts-expect-error mock prisma for unit isolation
  prisma.tradeJournal.findUnique = async () => ({
    id: 'gap-early-exit',
    signalType: 'BTST',
    entryCmp: 100,
    exitCmp: 80,
    cmp916: null,
    cmp930: null,
    cmp945: null,
    pnlPct: -20,
    qualityBucketAtSignal: 'TRADEABLE',
    eventRiskScoreAtSignal: null,
  });
  // @ts-expect-error mock prisma for unit isolation
  prisma.tradeJournal.update = async (args: { data: { executionOutcome: string } }) => {
    outcomeWritten = args.data.executionOutcome;
    return {};
  };

  try {
    await TradeJournalService.classifyExecutionOutcome('gap-early-exit');
    assert.equal(outcomeWritten, 'GAP_FAILURE');
  } finally {
    prisma.tradeJournal.findUnique = originalFind;
    prisma.tradeJournal.update = originalUpdate;
  }
});
