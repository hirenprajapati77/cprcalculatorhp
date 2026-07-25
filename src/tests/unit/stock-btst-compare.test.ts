import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { getStockBtstCompare } from '../../services/journal/stock-btst-compare.service';

describe('getStockBtstCompare', () => {
  it('excludes breakeven live and backtest trades from win-rate denominators', async () => {
    const originalBacktestFindUnique = prisma.backtestRun.findUnique;
    const originalJournalFindMany = prisma.tradeJournal.findMany;
    const originalTradeFindMany = prisma.trade.findMany;

    prisma.backtestRun.findUnique = (async () => ({
      id: 'run-stock',
      name: 'Stock BTST Regression',
      startDate: new Date('2026-07-21T00:00:00.000Z'),
      endDate: new Date('2026-07-21T00:00:00.000Z'),
    })) as typeof prisma.backtestRun.findUnique;

    prisma.tradeJournal.findMany = (async () => [
      {
        id: 'live-win',
        symbol: 'RELIANCE',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'BTST_READY,TRADEABLE,LONG',
        optionContract: '26723 1400 CE',
        entryCmp: 100,
        exitCmp: 110,
        pnlPct: 10,
        regimeSnapshotAtSignal: null,
      },
      {
        id: 'live-flat',
        symbol: 'SBIN',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'BTST_READY,TRADEABLE,LONG',
        optionContract: '26723 800 CE',
        entryCmp: 100,
        exitCmp: 100,
        pnlPct: 0,
        regimeSnapshotAtSignal: null,
      },
      {
        id: 'live-loss',
        symbol: 'INFY',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'BTST_READY,TRADEABLE,LONG',
        optionContract: '26723 1600 CE',
        entryCmp: 100,
        exitCmp: 90,
        pnlPct: -10,
        regimeSnapshotAtSignal: null,
      },
    ]) as typeof prisma.tradeJournal.findMany;

    prisma.trade.findMany = (async () => [
      {
        id: 'bt-win',
        symbol: 'RELIANCE',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_TARGET',
        pnl: 100,
        pnlPercent: 1,
        type: 'LONG',
        score: 90,
        exitReason: 'TARGET',
        signalsJson: null,
      },
      {
        id: 'bt-flat',
        symbol: 'SBIN',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_TIME_EXIT',
        pnl: 0,
        pnlPercent: 0,
        type: 'LONG',
        score: 90,
        exitReason: 'TIME',
        signalsJson: null,
      },
      {
        id: 'bt-loss',
        symbol: 'INFY',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_SL',
        pnl: -50,
        pnlPercent: -0.5,
        type: 'LONG',
        score: 90,
        exitReason: 'SL',
        signalsJson: null,
      },
    ]) as typeof prisma.trade.findMany;

    try {
      const result = await getStockBtstCompare('run-stock');

      assert.equal(result.summary.liveClosed, 3);
      assert.equal(result.summary.liveWinRate, 50);
      assert.equal(result.summary.backtestWinRate, 50);
    } finally {
      prisma.backtestRun.findUnique = originalBacktestFindUnique;
      prisma.tradeJournal.findMany = originalJournalFindMany;
      prisma.trade.findMany = originalTradeFindMany;
    }
  });

  it('returns null win rates when closed trades are all breakeven', async () => {
    const originalBacktestFindUnique = prisma.backtestRun.findUnique;
    const originalJournalFindMany = prisma.tradeJournal.findMany;
    const originalTradeFindMany = prisma.trade.findMany;

    prisma.backtestRun.findUnique = (async () => ({
      id: 'run-flat',
      name: 'Stock BTST Flat',
      startDate: new Date('2026-07-21T00:00:00.000Z'),
      endDate: new Date('2026-07-21T00:00:00.000Z'),
    })) as typeof prisma.backtestRun.findUnique;

    prisma.tradeJournal.findMany = (async () => [
      {
        id: 'live-flat',
        symbol: 'RELIANCE',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'BTST_READY,TRADEABLE,LONG',
        optionContract: '26723 1400 CE',
        entryCmp: 100,
        exitCmp: 100,
        pnlPct: 0,
        regimeSnapshotAtSignal: null,
      },
    ]) as typeof prisma.tradeJournal.findMany;

    prisma.trade.findMany = (async () => [
      {
        id: 'bt-flat',
        symbol: 'RELIANCE',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_TIME_EXIT',
        pnl: 0,
        pnlPercent: 0,
        type: 'LONG',
        score: 90,
        exitReason: 'TIME',
        signalsJson: null,
      },
    ]) as typeof prisma.trade.findMany;

    try {
      const result = await getStockBtstCompare('run-flat');

      assert.equal(result.summary.liveClosed, 1);
      assert.equal(result.summary.liveWinRate, null);
      assert.equal(result.summary.backtestWinRate, null);
    } finally {
      prisma.backtestRun.findUnique = originalBacktestFindUnique;
      prisma.tradeJournal.findMany = originalJournalFindMany;
      prisma.trade.findMany = originalTradeFindMany;
    }
  });
});
