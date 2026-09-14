import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/db';
import { getIndexBtstCompare } from '../../services/journal/index-btst-compare.service';

describe('getIndexBtstCompare', () => {
  it('excludes breakeven live and backtest trades from win-rate denominators', async () => {
    const originalBacktestFindUnique = prisma.backtestRun.findUnique;
    const originalJournalFindMany = prisma.tradeJournal.findMany;
    const originalTradeFindMany = prisma.trade.findMany;

    prisma.backtestRun.findUnique = (async () => ({
      id: 'run-index',
      name: 'Index BTST Regression',
      startDate: new Date('2026-07-21T00:00:00.000Z'),
      endDate: new Date('2026-07-21T00:00:00.000Z'),
    })) as unknown as typeof prisma.backtestRun.findUnique;

    prisma.tradeJournal.findMany = (async () => [
      {
        id: 'live-win',
        symbol: 'NIFTY',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'INDEX_READY,INDEX',
        optionContract: '26723 22500 CE',
        entryCmp: 100,
        exitCmp: 110,
        pnlPct: 10,
        regimeSnapshotAtSignal: null,
      },
      {
        id: 'live-flat',
        symbol: 'BANKNIFTY',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'INDEX_READY,INDEX',
        optionContract: '26723 52000 CE',
        entryCmp: 100,
        exitCmp: 100,
        pnlPct: 0,
        regimeSnapshotAtSignal: null,
      },
      {
        id: 'live-loss',
        symbol: 'SENSEX',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'INDEX_READY,INDEX',
        optionContract: '26723 76000 CE',
        entryCmp: 100,
        exitCmp: 90,
        pnlPct: -10,
        regimeSnapshotAtSignal: null,
      },
    ]) as typeof prisma.tradeJournal.findMany;

    prisma.trade.findMany = (async () => [
      {
        id: 'bt-win',
        symbol: 'NIFTY',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_TARGET',
        pnl: 100,
        pnlPercent: 1,
        score: 90,
        exitReason: 'TARGET',
        signalsJson: null,
      },
      {
        id: 'bt-flat',
        symbol: 'BANKNIFTY',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_TIME_EXIT',
        pnl: 0,
        pnlPercent: 0,
        score: 90,
        exitReason: 'TIME',
        signalsJson: null,
      },
      {
        id: 'bt-loss',
        symbol: 'SENSEX',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_SL',
        pnl: -50,
        pnlPercent: -0.5,
        score: 90,
        exitReason: 'SL',
        signalsJson: null,
      },
    ]) as typeof prisma.trade.findMany;

    try {
      const result = await getIndexBtstCompare('run-index');

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
      name: 'Index BTST Flat',
      startDate: new Date('2026-07-21T00:00:00.000Z'),
      endDate: new Date('2026-07-21T00:00:00.000Z'),
    })) as unknown as typeof prisma.backtestRun.findUnique;

    prisma.tradeJournal.findMany = (async () => [
      {
        id: 'live-flat',
        symbol: 'NIFTY',
        tradeDate: new Date('2026-07-21T09:45:00.000Z'),
        score: 90,
        signalSummary: 'INDEX_READY,INDEX',
        optionContract: '26723 22500 CE',
        entryCmp: 100,
        exitCmp: 100,
        pnlPct: 0,
        regimeSnapshotAtSignal: null,
      },
    ]) as typeof prisma.tradeJournal.findMany;

    prisma.trade.findMany = (async () => [
      {
        id: 'bt-flat',
        symbol: 'NIFTY',
        entryDate: new Date('2026-07-21T09:45:00.000Z'),
        status: 'CLOSED_TIME_EXIT',
        pnl: 0,
        pnlPercent: 0,
        score: 90,
        exitReason: 'TIME',
        signalsJson: null,
      },
    ]) as typeof prisma.trade.findMany;

    try {
      const result = await getIndexBtstCompare('run-flat');

      assert.equal(result.summary.liveClosed, 1);
      assert.equal(result.summary.liveWinRate, null);
      assert.equal(result.summary.backtestWinRate, null);
    } finally {
      prisma.backtestRun.findUnique = originalBacktestFindUnique;
      prisma.tradeJournal.findMany = originalJournalFindMany;
      prisma.trade.findMany = originalTradeFindMany;
    }
  });

  it('queries BTST_STBT_DRIVEN strategyMode for backtest resolution and trades (D5-4)', async () => {
    const originalBacktestFindFirst = prisma.backtestRun.findFirst;
    const originalTradeFindMany = prisma.trade.findMany;
    const originalJournalFindMany = prisma.tradeJournal.findMany;

    let backtestQueryArgs: any = null;
    let tradeQueryArgs: any = null;

    prisma.backtestRun.findFirst = (async (args: any) => {
      backtestQueryArgs = args;
      return {
        id: 'run-auto',
        name: 'Auto Run',
        startDate: new Date('2026-07-21T00:00:00.000Z'),
        endDate: new Date('2026-07-21T00:00:00.000Z'),
      };
    }) as unknown as typeof prisma.backtestRun.findFirst;

    prisma.tradeJournal.findMany = (async () => []) as typeof prisma.tradeJournal.findMany;

    prisma.trade.findMany = (async (args: any) => {
      tradeQueryArgs = args;
      return [];
    }) as typeof prisma.trade.findMany;

    try {
      await getIndexBtstCompare();

      assert.ok(backtestQueryArgs, 'backtestRun.findFirst should be called');
      assert.strictEqual(
        backtestQueryArgs.where?.strategyMode,
        'BTST_STBT_DRIVEN',
        'resolveBacktestRun must query strategyMode BTST_STBT_DRIVEN'
      );

      assert.ok(tradeQueryArgs, 'trade.findMany should be called');
      assert.strictEqual(
        tradeQueryArgs.where?.strategyMode,
        'BTST_STBT_DRIVEN',
        'trade.findMany must query strategyMode BTST_STBT_DRIVEN'
      );
    } finally {
      prisma.backtestRun.findFirst = originalBacktestFindFirst;
      prisma.trade.findMany = originalTradeFindMany;
      prisma.tradeJournal.findMany = originalJournalFindMany;
    }
  });
});
