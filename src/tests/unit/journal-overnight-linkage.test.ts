/**
 * P1-2: Journal must link the exact OvernightSignal selected by the pipeline,
 * not the newest row by createdAt when multiple signalTime rows exist.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { TradeJournalService } from '../../services/journal/trade-journal.service';

describe('TradeJournal logSignal overnightSignalId linkage (P1-2)', () => {
  const selectedId = 'ov-selected-high-score';
  const newerWeakId = 'ov-newer-weak-rescan';
  const symbol = 'JIOFIN_P1';

  let originalFetchCmp: typeof TradeJournalService.fetchOptionCmp;
  let createdJournalId: string | null = null;

  before(async () => {
    originalFetchCmp = TradeJournalService.fetchOptionCmp;
    TradeJournalService.fetchOptionCmp = async () => 42;

    const signalDate = TradeJournalService.todayISTString();
    // Older TRADEABLE pick (the one journal cron would select by score)
    await prisma.overnightSignal.create({
      data: {
        id: selectedId,
        symbol,
        signalDate,
        signalTime: '15:10',
        direction: 'LONG',
        entry: 100,
        stopLoss: 98,
        target: 104,
        overnightScore: 110,
        confidence: 80,
        classification: 'STRONG_BTST',
        qualityBucket: 'TRADEABLE',
        exitStrategy: 'EOD',
        createdAt: new Date('2026-07-19T09:40:00.000Z'),
      },
    });
    // Newer weaker rescan — would win findFirst(orderBy createdAt desc)
    await prisma.overnightSignal.create({
      data: {
        id: newerWeakId,
        symbol,
        signalDate,
        signalTime: '15:20',
        direction: 'LONG',
        entry: 99,
        stopLoss: 97,
        target: 103,
        overnightScore: 70,
        confidence: 50,
        classification: 'WATCH',
        qualityBucket: 'WATCHLIST',
        exitStrategy: 'EOD',
        createdAt: new Date('2026-07-19T09:50:00.000Z'),
      },
    });
  });

  after(async () => {
    TradeJournalService.fetchOptionCmp = originalFetchCmp;
    if (createdJournalId) {
      await prisma.tradeJournal.deleteMany({ where: { id: createdJournalId } });
    }
    await prisma.tradeJournal.deleteMany({ where: { symbol, signalType: 'BTST' } });
    await prisma.overnightSignal.deleteMany({ where: { id: { in: [selectedId, newerWeakId] } } });
  });

  it('persists overnightSignalId / model prices from the selected id, not the newest row', async () => {
    const ok = await TradeJournalService.logSignal({
      signalType: 'BTST',
      symbol,
      optionContract: '100 CE',
      optionStrike: 100,
      optionType: 'CE',
      score: 110,
      confidence: 80,
      signalSummary: 'STRONG_BTST,TRADEABLE,LONG',
      overnightSignalId: selectedId,
    });
    assert.equal(ok, true);

    const row = await prisma.tradeJournal.findFirst({
      where: { symbol, signalType: 'BTST' },
      orderBy: { entryTime: 'desc' },
    });
    assert.ok(row);
    createdJournalId = row!.id;
    assert.equal(row!.overnightSignalId, selectedId);
    assert.equal(row!.modelEntryPrice, 100);
    assert.equal(row!.modelExitPrice, 104);
    assert.equal(row!.qualityBucketAtSignal, 'TRADEABLE');
    assert.notEqual(row!.overnightSignalId, newerWeakId);
  });
});
