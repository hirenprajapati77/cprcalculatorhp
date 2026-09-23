import test from 'node:test';
import assert from 'node:assert';
import { TradeJournalService } from '../../services/journal/trade-journal.service';
import { prisma } from '../../lib/db';

test('TradeJournalService.isShortUnderlyingLeg', async (t) => {
  await t.test('returns true for STBT with UNDERLYING PE', () => {
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({
        signalType: 'STBT',
        optionContract: 'UNDERLYING PE',
      }),
      true
    );
  });

  await t.test('returns false for BTST with UNDERLYING CE', () => {
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({
        signalType: 'BTST',
        optionContract: 'UNDERLYING CE',
      }),
      false
    );
  });

  await t.test('returns false for CPR with UNDERLYING PE', () => {
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({
        signalType: 'CPR',
        optionContract: 'UNDERLYING PE',
      }),
      false
    );
  });

  await t.test('returns false for STBT with standard option PE contract', () => {
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({
        signalType: 'STBT',
        optionContract: 'SEP 2026 660 PE',
      }),
      false
    );
  });

  await t.test('returns false for BTST with standard option CE contract', () => {
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({
        signalType: 'BTST',
        optionContract: 'SEP 2026 660 CE',
      }),
      false
    );
  });

  await t.test('returns false for invalid / missing optionContract', () => {
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({ signalType: 'STBT', optionContract: null }),
      false
    );
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({ signalType: 'STBT', optionContract: undefined }),
      false
    );
    assert.strictEqual(
      TradeJournalService.isShortUnderlyingLeg({ signalType: 'STBT', optionContract: '' }),
      false
    );
  });

  // R-1: STBT with non-UNDERLYING contract must return false AND log a warning.
  // The PnL formula falls back to LONG (exitCmp - entryCmp) — not ideal but at least
  // the warning surfaces the data inconsistency so it can be corrected at the source.
  await t.test('R-1: STBT with non-UNDERLYING optionContract returns false and emits warning', () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
    try {
      const result = TradeJournalService.isShortUnderlyingLeg({
        signalType: 'STBT',
        optionContract: 'OCT 2026 500 PE',
      });
      assert.strictEqual(result, false, 'Should return false — wrong PnL direction would be used');
      assert.ok(
        warnings.some((w) => w.includes('R-1 WARNING') && w.includes('OCT 2026 500 PE')),
        'Should emit an R-1 WARNING log identifying the problematic optionContract'
      );
    } finally {
      console.warn = origWarn;
    }
  });
});


test('TradeJournalService.captureSnapshot direction-aware auto-close', async (t) => {
  const origFindMany = prisma.tradeJournal.findMany;
  const origUpdateMany = prisma.tradeJournal.updateMany;
  const origClassify = TradeJournalService.classifyExecutionOutcome;

  let updateCalls: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];

  TradeJournalService.classifyExecutionOutcome = async () => {};

  await t.test('auto-close computes negative PnL for STBT underlying when stock rises', async () => {
    updateCalls = [];
    const mockEntry = {
      id: 'trade-stbt-rise',
      symbol: 'PNBHOUSING',
      signalType: 'STBT',
      optionContract: 'UNDERLYING PE',
      optionStrike: 0,
      optionType: 'PE',
      entryCmp: 1106.3,
      cmp916: 1110.0,
      cmp930: 1115.0,
      cmp945: null,
      exitCmp: null,
    };

    prisma.tradeJournal.findMany = (async () => [mockEntry]) as any;
    prisma.tradeJournal.updateMany = (async (args: any) => {
      updateCalls.push(args);
      return { count: 1 };
    }) as any;

    // Simulate 9:45 AM auto-close snapshot with market price 1121.9
    const { MarketService } = await import('../../services/market.service');
    const origGetStockData = MarketService.getStockData;
    MarketService.getStockData = (async () => ({ ltp: 1121.9 })) as any;

    try {
      await TradeJournalService.captureSnapshot('945', new Date('2026-09-17T04:15:00.000Z'));
      assert.strictEqual(updateCalls.length >= 1, true);
      const closeCall = updateCalls.find((c) => c.data.exitCmp === 1121.9);
      assert.ok(closeCall, 'Expected an update with exitCmp 1121.9');
      assert.strictEqual(closeCall.data.pnl, -15.6);
      assert.strictEqual(closeCall.data.pnlPct, -1.41);
    } finally {
      MarketService.getStockData = origGetStockData;
    }
  });

  await t.test('auto-close computes positive PnL for STBT underlying when stock falls', async () => {
    updateCalls = [];
    const mockEntry = {
      id: 'trade-stbt-fall',
      symbol: 'SHORTSTK',
      signalType: 'STBT',
      optionContract: 'UNDERLYING PE',
      optionStrike: 0,
      optionType: 'PE',
      entryCmp: 100.0,
      cmp916: 98.0,
      cmp930: 96.0,
      cmp945: null,
      exitCmp: null,
    };

    prisma.tradeJournal.findMany = (async () => [mockEntry]) as any;
    prisma.tradeJournal.updateMany = (async (args: any) => {
      updateCalls.push(args);
      return { count: 1 };
    }) as any;

    const { MarketService } = await import('../../services/market.service');
    const origGetStockData = MarketService.getStockData;
    MarketService.getStockData = (async () => ({ ltp: 95.0 })) as any;

    try {
      await TradeJournalService.captureSnapshot('945', new Date('2026-09-17T04:15:00.000Z'));
      const closeCall = updateCalls.find((c) => c.data.exitCmp === 95.0);
      assert.ok(closeCall, 'Expected an update with exitCmp 95.0');
      assert.strictEqual(closeCall.data.pnl, 5);
      assert.strictEqual(closeCall.data.pnlPct, 5);
    } finally {
      MarketService.getStockData = origGetStockData;
    }
  });

  await t.test('auto-close computes positive PnL for standard STBT option when premium rises', async () => {
    updateCalls = [];
    const mockEntry = {
      id: 'trade-stbt-option-win',
      symbol: 'SENSEX',
      signalType: 'STBT',
      optionContract: '17 SEP 2026 75000 PE',
      optionStrike: 75000,
      optionType: 'PE',
      entryCmp: 500.0,
      cmp916: 600.0,
      cmp930: 700.0,
      cmp945: null,
      exitCmp: null,
    };

    prisma.tradeJournal.findMany = (async () => [mockEntry]) as any;
    prisma.tradeJournal.updateMany = (async (args: any) => {
      updateCalls.push(args);
      return { count: 1 };
    }) as any;

    const origFetchOptionCmp = TradeJournalService.fetchOptionCmp;
    TradeJournalService.fetchOptionCmp = (async () => 800.0) as any;

    try {
      await TradeJournalService.captureSnapshot('945', new Date('2026-09-17T04:15:00.000Z'));
      const closeCall = updateCalls.find((c) => c.data.exitCmp === 800.0);
      assert.ok(closeCall, 'Expected an update with exitCmp 800.0');
      assert.strictEqual(closeCall.data.pnl, 300);
      assert.strictEqual(closeCall.data.pnlPct, 60);
    } finally {
      TradeJournalService.fetchOptionCmp = origFetchOptionCmp;
    }
  });

  // Restore
  prisma.tradeJournal.findMany = origFindMany;
  prisma.tradeJournal.updateMany = origUpdateMany;
  TradeJournalService.classifyExecutionOutcome = origClassify;
});

test('Manual exit PATCH route direction-aware PnL', async (t) => {
  const { PATCH } = await import('../../app/api/journal/route');
  const { NextRequest } = await import('next/server');

  const origFindUnique = prisma.tradeJournal.findUnique;
  const origUpdateMany = prisma.tradeJournal.updateMany;
  const origClassify = TradeJournalService.classifyExecutionOutcome;

  TradeJournalService.classifyExecutionOutcome = async () => {};

  await t.test('PATCH manual exit computes negative PnL for STBT underlying when stock rises', async () => {
    let recordedUpdate: any = null;
    const mockEntry = {
      id: 'trade-patch-stbt-underlying',
      symbol: 'PNBHOUSING',
      signalType: 'STBT',
      optionContract: 'UNDERLYING PE',
      optionStrike: 0,
      optionType: 'PE',
      entryCmp: 1106.3,
      exitCmp: null,
    };

    prisma.tradeJournal.findUnique = (async () => mockEntry) as any;
    prisma.tradeJournal.updateMany = (async (args: any) => {
      recordedUpdate = args.data;
      return { count: 1 };
    }) as any;

    const req = new NextRequest('http://localhost:3000/api/journal', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'trade-patch-stbt-underlying', exitCmp: 1121.9 }),
    });

    const res = await PATCH(req);
    assert.strictEqual(res.status, 200);
    assert.ok(recordedUpdate !== null);
    assert.strictEqual(recordedUpdate.exitCmp, 1121.9);
    assert.strictEqual(recordedUpdate.pnl, -15.6);
    assert.strictEqual(recordedUpdate.pnlPct, -1.41);
  });

  await t.test('PATCH manual exit computes positive PnL for standard STBT option when premium rises', async () => {
    let recordedUpdate: any = null;
    const mockEntry = {
      id: 'trade-patch-stbt-option',
      symbol: 'SENSEX',
      signalType: 'STBT',
      optionContract: '17 SEP 2026 75000 PE',
      optionStrike: 75000,
      optionType: 'PE',
      entryCmp: 500.0,
      exitCmp: null,
    };

    prisma.tradeJournal.findUnique = (async () => mockEntry) as any;
    prisma.tradeJournal.updateMany = (async (args: any) => {
      recordedUpdate = args.data;
      return { count: 1 };
    }) as any;

    const req = new NextRequest('http://localhost:3000/api/journal', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'trade-patch-stbt-option', exitCmp: 800.0 }),
    });

    const res = await PATCH(req);
    assert.strictEqual(res.status, 200);
    assert.ok(recordedUpdate !== null);
    assert.strictEqual(recordedUpdate.exitCmp, 800.0);
    assert.strictEqual(recordedUpdate.pnl, 300);
    assert.strictEqual(recordedUpdate.pnlPct, 60);
  });

  // Restore
  prisma.tradeJournal.findUnique = origFindUnique;
  prisma.tradeJournal.updateMany = origUpdateMany;
  TradeJournalService.classifyExecutionOutcome = origClassify;
});

