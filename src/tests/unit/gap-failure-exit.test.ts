import test from 'node:test';
import assert from 'node:assert';
import { type OvernightSignal } from '@prisma/client';
import { prisma } from '../../lib/db';
import { MarketService } from '../../services/market.service';
import { TelegramService } from '../../services/alert/telegram.service';
import { checkGapFailureExits } from '../../services/scheduler/btst-alert.job';

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
});
