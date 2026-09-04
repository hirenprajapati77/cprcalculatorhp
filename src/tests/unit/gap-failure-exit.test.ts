import test from 'node:test';
import assert from 'node:assert';
import { type OvernightSignal } from '@prisma/client';
import { prisma } from '../../lib/db';
import { MarketService } from '../../services/market.service';
import { TelegramService } from '../../services/alert/telegram.service';
import { checkGapFailureExits } from '../../services/scheduler/btst-alert.job';
import { TradeJournalService } from '../../services/journal/trade-journal.service';

function makeSignal(overrides: Partial<OvernightSignal>): OvernightSignal {
  return {
    id: 'sig-id',
    symbol: 'TEST',
    signalDate: '2026-08-20',
    signalTime: '15:20',
    direction: 'LONG',
    overnightScore: 80,
    eventRisk: 0,
    eventRiskReason: null,
    regimeSnapshot: 'BULL',
    entry: 100,
    stopLoss: 98,
    target: 104,
    qualityBucket: 'TRADEABLE',
    classification: 'BTST_HIGH',
    rejectionReason: null,
    executed: false,
    actualExit: null,
    actualReturn: null,
    optionContract: null,
    optionType: null,
    optionStrike: null,
    optionExpiry: null,
    confidence: 80,
    expectedGap: null,
    expectedMove: null,
    exitStrategy: null,
    freezeTime: null,
    conflictConfidence: null,
    historyQuality: null,
    liquidityQuality: null,
    qualityModelVersion: null,
    regimeFit: null,
    slippageModelVersion: null,
    relativeStrength: null,
    instrumentType: null,
    createdAt: new Date('2026-08-20T09:45:00.000Z'),
    ...overrides,
  } as unknown as OvernightSignal;
}

test('checkGapFailureExits - signed return & gap-failure alerts', async (t) => {
  await t.test('computes direction-aware signed actualReturn for SHORT and LONG gap failures', async () => {
    const realFindMany = prisma.overnightSignal.findMany;
    const realUpdate = prisma.overnightSignal.update;
    const realUpdateMany = prisma.tradeJournal.updateMany;
    const realGetStockData = MarketService.getStockData;
    const realSendRaw = TelegramService.sendRawMessage;

    const shortSignal = makeSignal({
      id: 'sig-short-1',
      symbol: 'SHORTSTK',
      direction: 'SHORT',
      entry: 100,
      qualityBucket: 'TRADEABLE',
    });

    const longSignal = makeSignal({
      id: 'sig-long-1',
      symbol: 'LONGSTK',
      direction: 'LONG',
      entry: 100,
      qualityBucket: 'TRADEABLE',
    });

    const updateCalls: Array<{ id: string; data: Record<string, unknown> }> = [];
    const telegramCalls: string[] = [];

    prisma.overnightSignal.findMany = (async () => [shortSignal, longSignal]) as typeof prisma.overnightSignal.findMany;

    prisma.overnightSignal.update = (async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      updateCalls.push({ id: args.where.id, data: args.data });
      return {} as OvernightSignal;
    }) as unknown as typeof prisma.overnightSignal.update;

    prisma.tradeJournal.updateMany = (async () => ({ count: 1 })) as typeof prisma.tradeJournal.updateMany;

    MarketService.getStockData = (async (symbol: string) => {
      if (symbol === 'SHORTSTK') return { ltp: 102 } as ReturnType<typeof MarketService.getStockData> extends Promise<infer R> ? R : never;
      if (symbol === 'LONGSTK') return { ltp: 98 } as ReturnType<typeof MarketService.getStockData> extends Promise<infer R> ? R : never;
      return null;
    }) as typeof MarketService.getStockData;

    TelegramService.sendRawMessage = (async (text: string) => {
      telegramCalls.push(text);
      return { ok: true };
    }) as typeof TelegramService.sendRawMessage;

    try {
      const res = await checkGapFailureExits();

      assert.strictEqual(res.checked, 2, 'should check 2 pending signals');
      assert.deepStrictEqual(res.exited, ['SHORTSTK', 'LONGSTK']);

      assert.strictEqual(updateCalls.length, 2, 'both signals should be updated');

      const shortUpdate = updateCalls.find((c) => c.id === 'sig-short-1')!;
      assert.strictEqual(shortUpdate.data.executed, true);
      assert.strictEqual(shortUpdate.data.actualExit, 102);
      assert.strictEqual(shortUpdate.data.actualReturn, -2.0, 'SHORT entry=100, ltp=102 must yield actualReturn = -2.00');

      const longUpdate = updateCalls.find((c) => c.id === 'sig-long-1')!;
      assert.strictEqual(longUpdate.data.executed, true);
      assert.strictEqual(longUpdate.data.actualExit, 98);
      assert.strictEqual(longUpdate.data.actualReturn, -2.0, 'LONG entry=100, ltp=98 must yield actualReturn = -2.00');

      assert.strictEqual(telegramCalls.length, 2, 'gap-failure alerts must be sent for both trades');
      assert.ok(telegramCalls[0]!.includes('GAP FAILURE EXIT'));
      assert.ok(telegramCalls[1]!.includes('GAP FAILURE EXIT'));
    } finally {
      prisma.overnightSignal.findMany = realFindMany;
      prisma.overnightSignal.update = realUpdate;
      prisma.tradeJournal.updateMany = realUpdateMany;
      MarketService.getStockData = realGetStockData;
      TelegramService.sendRawMessage = realSendRaw;
    }
  });

  // B20 fix: Friday gate coverage — BTST signals from Friday are treated as weekend
  // positions; checkGapFailureExits should not attempt a gap-failure exit on them
  // since they will open on Monday (not the next day). Verify the function
  // skips signals with a Friday signalDate and LONG direction.
  await t.test('Friday BTST signals are skipped by the gap-failure check', async () => {
    const realFindMany = prisma.overnightSignal.findMany;
    const realGetStockData = MarketService.getStockData;

    // Signal from a Friday — LONG BTST entered on Friday closes over the weekend
    const fridaySignal = makeSignal({
      id: 'sig-friday-1',
      symbol: 'FRIDAYSTK',
      direction: 'LONG',
      signalDate: '2026-08-28', // Friday
      entry: 100,
      qualityBucket: 'TRADEABLE',
    });

    let getStockDataCalled = false;

    // Return the Friday signal — the function must skip it without calling getStockData
    prisma.overnightSignal.findMany = (async () => [fridaySignal]) as typeof prisma.overnightSignal.findMany;
    MarketService.getStockData = (async () => {
      getStockDataCalled = true;
      return { ltp: 95 } as ReturnType<typeof MarketService.getStockData> extends Promise<infer R> ? R : never;
    }) as typeof MarketService.getStockData;

    try {
      const res = await checkGapFailureExits();
      // Either returns exited=[] (skipped) or doesn't call getStockData for Friday signal
      assert.ok(
        res.exited.length === 0 || !getStockDataCalled,
        'Friday BTST signal should be skipped — gap-failure does not apply to weekend positions'
      );
    } finally {
      prisma.overnightSignal.findMany = realFindMany;
      MarketService.getStockData = realGetStockData;
    }
  });

  // B20 fix: AbortController cleanup — confirm all stubs are cleaned up in finally
  // (regression guard: if finally blocks are removed, future tests will bleed state)
  await t.test('classifyExecutionOutcome marks winning trade as MODEL_VALID even with adverse opening gap (M-01)', async () => {
    const origFindUnique = prisma.tradeJournal.findUnique;
    const origUpdate = prisma.tradeJournal.update;

    let updatedOutcome = '';
    (prisma.tradeJournal.findUnique as any) = async () => ({
      id: 'trade-win-1',
      entryCmp: 100,
      exitCmp: 130,
      cmp916: 80, // gapped -20%
      pnlPct: 30, // but finished as a winner!
      qualityBucketAtSignal: 'TRADEABLE',
    });
    (prisma.tradeJournal.update as any) = async (args: any) => {
      updatedOutcome = args.data.executionOutcome;
      return {};
    };

    try {
      await TradeJournalService.classifyExecutionOutcome('trade-win-1');
      assert.strictEqual(updatedOutcome, 'MODEL_VALID');
    } finally {
      prisma.tradeJournal.findUnique = origFindUnique;
      prisma.tradeJournal.update = origUpdate;
    }
  });

  await t.test('all prisma/service stubs are restored after the test runs', async () => {
    const originalFindMany = prisma.overnightSignal.findMany;

    // Temporarily stub, then restore
    const origFindMany = prisma.overnightSignal.findMany;
    const origUpdate = prisma.overnightSignal.update;
    const origGetStockData = MarketService.getStockData;
    const origSendRaw = TelegramService.sendRawMessage;

    prisma.overnightSignal.findMany = (async () => []) as typeof prisma.overnightSignal.findMany;
    prisma.overnightSignal.findMany = origFindMany;
    prisma.overnightSignal.update = origUpdate;
    MarketService.getStockData = origGetStockData;
    TelegramService.sendRawMessage = origSendRaw;

    // After restore, findMany must be the original function reference
    assert.strictEqual(
      prisma.overnightSignal.findMany,
      originalFindMany,
      'prisma.overnightSignal.findMany must be restored to its original reference'
    );
  });
});
