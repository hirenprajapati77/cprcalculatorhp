import test from 'node:test';
import assert from 'node:assert';
import { Prisma, type OvernightSignal } from '@prisma/client';
import { prisma } from '../../lib/db';
import { TelegramService } from '../../services/alert/telegram.service';
import { RegimeService } from '../../services/overnight/regime.service';
import { OvernightService } from '../../services/overnight/overnight.service';
import { IndexDiscoverService } from '../../services/overnight/index-discover.service';
import { getISTDateString } from '../../lib/market-hours';
import { runBtstAlertJob } from '../../services/scheduler/btst-alert.job';
import { MarketService } from '../../services/market.service';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { TradeJournalService } from '../../services/journal/trade-journal.service';

/** Monday 2026-07-20 15:15 IST — inside BTST discovery window. */
const DISCOVERY_INSTANT = new Date('2026-07-20T09:45:00.000Z');

function makeUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    { code: 'P2002', clientVersion: '6.19.3' }
  );
}

async function withDiscoveryClock<T>(fn: () => Promise<T>): Promise<T> {
  const RealDate = globalThis.Date;
  class MockDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length) {
        super(...args);
      } else {
        super(DISCOVERY_INSTANT.getTime());
      }
    }
    static now() {
      return DISCOVERY_INSTANT.getTime();
    }
  }
  globalThis.Date = MockDate as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

function makeTradableSignal(overrides: Partial<OvernightSignal> = {}): OvernightSignal {
  return {
    id: 'btst-alert-test-signal',
    symbol: 'TEST',
    signalDate: getISTDateString(DISCOVERY_INSTANT),
    signalTime: '15:10',
    direction: 'LONG',
    entry: 100,
    stopLoss: 98,
    target: 104,
    overnightScore: 110,
    confidence: 90,
    classification: 'STRONG_BTST',
    qualityBucket: 'TRADEABLE',
    expectedGap: 0,
    expectedMove: 0,
    exitStrategy: 'EOD',
    createdAt: new Date(DISCOVERY_INSTANT),
    updatedAt: new Date(DISCOVERY_INSTANT),
    instrumentType: 'STOCK',
    scoreBreakdown: null,
    reasons: [],
    regime: null,
    ...overrides,
  } as unknown as OvernightSignal;
}

type BtstRouteMocks = {
  restore: () => void;
  createCalls: unknown[];
  deleteCalls: unknown[];
  deleteManyCallArgs: unknown[];
  sendCalls: unknown[];
  findManyCalls: unknown[];
  journalCalls: unknown[];
};

function mockBtstRouteDeps(handlers: {
  create?: (args: unknown) => Promise<unknown>;
  delete?: (args: unknown) => Promise<unknown>;
  deleteMany?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<{ symbol: string }[]>;
  sendBtstAlert?: (payload: unknown) => Promise<{ sent: boolean; reason?: string }>;
  discover?: () => Promise<OvernightSignal[]>;
  suggestOptionForBtst?: typeof OptionSuggestionService.suggestOptionForBtst;
  overnightSignalFindMany?: () => Promise<OvernightSignal[]>;
  logSignal?: typeof TradeJournalService.logSignal;
}): BtstRouteMocks {
  const originalCreate = prisma.btstAlertState.create;
  const originalDelete = prisma.btstAlertState.delete;
  const originalDeleteMany = prisma.btstAlertState.deleteMany;
  const originalFindMany = prisma.btstAlertState.findMany;
  const originalRegime = RegimeService.getMarketRegime;
  const originalDiscover = OvernightService.discover;
  const originalIndexDiscover = IndexDiscoverService.discover;
  const originalOvernightSignalFindMany = prisma.overnightSignal.findMany;
  const originalSend = TelegramService.sendBtstAlert;
  const originalGetStockData = MarketService.getStockData;
  const originalSuggestOption = OptionSuggestionService.suggestOptionForBtst;
  const originalLogSignal = TradeJournalService.logSignal;

  const createCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];
  const deleteManyCallArgs: unknown[] = [];
  const sendCalls: unknown[] = [];
  const findManyCalls: unknown[] = [];
  const journalCalls: unknown[] = [];

  // findMany — returns already-alerted symbols for the day (default: none)
  prisma.btstAlertState.findMany = (async (args: unknown) => {
    findManyCalls.push(args);
    if (handlers.findMany) {
      return handlers.findMany(args);
    }
    return [];
  }) as unknown as typeof prisma.btstAlertState.findMany;

  prisma.btstAlertState.create = (async (args: unknown) => {
    createCalls.push(args);
    if (handlers.create) {
      return handlers.create(args);
    }
    const a = args as { data: { date: string; symbol: string } };
    return { id: 1, date: a.data.date, symbol: a.data.symbol, sentAt: new Date(), updatedAt: new Date() };
  }) as unknown as typeof prisma.btstAlertState.create;

  prisma.btstAlertState.delete = (async (args: unknown) => {
    deleteCalls.push(args);
    if (handlers.delete) {
      return handlers.delete(args);
    }
    return { id: 1, date: getISTDateString(DISCOVERY_INSTANT), symbol: 'TEST', sentAt: new Date(), updatedAt: new Date() };
  }) as unknown as typeof prisma.btstAlertState.delete;

  prisma.btstAlertState.deleteMany = (async (args: unknown) => {
    deleteManyCallArgs.push(args);
    if (handlers.deleteMany) {
      return handlers.deleteMany(args);
    }
    return { count: 1 };
  }) as unknown as typeof prisma.btstAlertState.deleteMany;

  RegimeService.getMarketRegime = (async () => ({
    trend: 'BULL',
    volatility: 'LOW',
    score: 70,
  })) as typeof RegimeService.getMarketRegime;

  OvernightService.discover = (handlers.discover ?? (async () => [makeTradableSignal()])) as typeof OvernightService.discover;
  MarketService.getStockData = (async () => null) as typeof MarketService.getStockData;
  OptionSuggestionService.suggestOptionForBtst =
    (handlers.suggestOptionForBtst ?? (async () => ({ error: 'NO_CHAIN' }))) as typeof OptionSuggestionService.suggestOptionForBtst;

  // Index BTST leg: no index signals by default — keeps this a pure unit test.
  IndexDiscoverService.discover = (async () => []) as typeof IndexDiscoverService.discover;
  prisma.overnightSignal.findMany = (handlers.overnightSignalFindMany ??
    (async () => [])) as unknown as typeof prisma.overnightSignal.findMany;

  TradeJournalService.logSignal = (async (params: unknown) => {
    journalCalls.push(params);
    if (handlers.logSignal) {
      return handlers.logSignal(params as Parameters<typeof TradeJournalService.logSignal>[0]);
    }
    return true;
  }) as typeof TradeJournalService.logSignal;

  TelegramService.sendBtstAlert = (async (payload: unknown) => {
    sendCalls.push(payload);
    if (handlers.sendBtstAlert) {
      return handlers.sendBtstAlert(payload);
    }
    return { sent: true };
  }) as typeof TelegramService.sendBtstAlert;

  return {
    createCalls,
    deleteCalls,
    deleteManyCallArgs,
    sendCalls,
    findManyCalls,
    journalCalls,
    restore: () => {
      prisma.btstAlertState.create = originalCreate;
      prisma.btstAlertState.delete = originalDelete;
      prisma.btstAlertState.deleteMany = originalDeleteMany;
      prisma.btstAlertState.findMany = originalFindMany;
      RegimeService.getMarketRegime = originalRegime;
      OvernightService.discover = originalDiscover;
      IndexDiscoverService.discover = originalIndexDiscover;
      prisma.overnightSignal.findMany = originalOvernightSignalFindMany;
      TelegramService.sendBtstAlert = originalSend;
      MarketService.getStockData = originalGetStockData;
      OptionSuggestionService.suggestOptionForBtst = originalSuggestOption;
      TradeJournalService.logSignal = originalLogSignal;
    },
  };
}

test('BTST alert cron — BtstAlertState claim logic (per-symbol dedup)', async (t) => {
  await t.test('first claim of the day: findMany returns empty, create succeeds, send succeeds → sent true', async () => {
    const mocks = mockBtstRouteDeps({
      findMany: async () => [], // no symbols alerted yet
      create: async (args) => {
        const a = args as { data: { date: string; symbol: string } };
        return { id: 1, date: a.data.date, symbol: a.data.symbol, sentAt: new Date(), updatedAt: new Date() };
      },
      sendBtstAlert: async () => ({ sent: true }),
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true);
      assert.strictEqual(mocks.findManyCalls.length, 1, 'findMany must be called once');
      assert.ok(mocks.createCalls.length >= 1, 'at least one symbol claim must be created');
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 0, 'no rollback on success');
    } finally {
      mocks.restore();
    }
  });

  await t.test('symbol already alerted today: filtered out, no Telegram send', async () => {
    const signalDate = getISTDateString(DISCOVERY_INSTANT);
    const mocks = mockBtstRouteDeps({
      // TEST was already alerted at 15:10
      findMany: async () => [{ symbol: 'TEST' }],
      create: async () => { throw new Error('create must not be called for already-sent symbol'); },
      sendBtstAlert: async () => { throw new Error('Telegram must not be called when all symbols already sent'); },
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'already sent today');
      assert.strictEqual(result.count, 0);
      assert.strictEqual(mocks.createCalls.length, 0);
      assert.strictEqual(mocks.sendCalls.length, 0);
      assert.ok(signalDate); // sanity
    } finally {
      mocks.restore();
    }
  });

  await t.test('pre-migration _legacy row locks the whole day (no re-blast)', async () => {
    const mocks = mockBtstRouteDeps({
      findMany: async () => [{ symbol: '_legacy' }],
      create: async () => { throw new Error('must not claim when _legacy day lock present'); },
      sendBtstAlert: async () => { throw new Error('must not send when _legacy day lock present'); },
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());
      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'already sent today');
      assert.strictEqual(result.count, 0);
      assert.strictEqual(mocks.createCalls.length, 0);
      assert.strictEqual(mocks.sendCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('claim-loop DB error rolls back already-claimed symbols', async () => {
    let createCount = 0;
    const mocks = mockBtstRouteDeps({
      discover: async () => [
        makeTradableSignal({ id: 'a', symbol: 'FIRST' }),
        makeTradableSignal({ id: 'b', symbol: 'SECOND' }),
      ],
      findMany: async () => [],
      create: async (args) => {
        createCount++;
        const a = args as { data: { date: string; symbol: string } };
        if (a.data.symbol === 'SECOND') {
          throw new Error('db unavailable');
        }
        return { id: createCount, date: a.data.date, symbol: a.data.symbol, sentAt: new Date(), updatedAt: new Date() };
      },
      sendBtstAlert: async () => { throw new Error('Telegram must not be called after claim failure'); },
    });

    try {
      await assert.rejects(
        () => withDiscoveryClock(() => runBtstAlertJob()),
        /db unavailable/
      );
      assert.strictEqual(mocks.sendCalls.length, 0);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 1, 'FIRST claim must be rolled back');
      const deleteArg = mocks.deleteManyCallArgs[0] as { where: { symbol: { in: string[] } } };
      assert.deepStrictEqual(deleteArg.where.symbol.in, ['FIRST']);
    } finally {
      mocks.restore();
    }
  });

  await t.test('new symbol at 15:20 bucket: existing symbol filtered, only new symbol sent', async () => {
    const mocks = mockBtstRouteDeps({
      discover: async () => [
        makeTradableSignal({ symbol: 'ALREADY_SENT', overnightScore: 115 }),
        makeTradableSignal({ id: 'new-signal', symbol: 'NEW_STOCK', overnightScore: 110 }),
      ],
      // ALREADY_SENT was alerted in the 15:10 bucket; NEW_STOCK is new
      findMany: async () => [{ symbol: 'ALREADY_SENT' }],
      sendBtstAlert: async (payload) => {
        const symbols = (payload as Array<{ symbol: string }>).map((r) => r.symbol);
        assert.deepStrictEqual(symbols, ['NEW_STOCK'], 'Only the new symbol should be sent');
        return { sent: true };
      },
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true);
      assert.strictEqual(mocks.sendCalls.length, 1);
      // Only NEW_STOCK should be claimed
      const claimArgs = mocks.createCalls as Array<{ data: { symbol: string } }>;
      assert.ok(claimArgs.every(a => a.data.symbol === 'NEW_STOCK'), 'Only new symbol should be claimed');
    } finally {
      mocks.restore();
    }
  });

  await t.test('concurrent race: create P2002 for all symbols → already sent, Telegram never called', async () => {
    const mocks = mockBtstRouteDeps({
      findMany: async () => [], // looks empty initially
      create: async () => { throw makeUniqueConstraintError(); }, // but concurrent run beat us
      sendBtstAlert: async () => { throw new Error('Telegram should not be called'); },
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'already sent today');
      assert.strictEqual(mocks.sendCalls.length, 0);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('claim succeeds, Telegram returns sent false → deleteMany rollback, failure response', async () => {
    const signalDate = getISTDateString(DISCOVERY_INSTANT);
    const mocks = mockBtstRouteDeps({
      findMany: async () => [],
      sendBtstAlert: async () => ({ sent: false, reason: 'telegram_api_error' }),
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'telegram_api_error');
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 1, 'deleteMany must roll back claims on failure');
      const deleteArg = mocks.deleteManyCallArgs[0] as { where: { date: string; symbol: { in: string[] } } };
      assert.strictEqual(deleteArg.where.date, signalDate);
      assert.ok(Array.isArray(deleteArg.where.symbol.in), 'rollback must target specific claimed symbols');
    } finally {
      mocks.restore();
    }
  });

  await t.test('claim succeeds, sendBtstAlert throws → deleteMany rollback, error re-thrown', async () => {
    const signalDate = getISTDateString(DISCOVERY_INSTANT);
    const mocks = mockBtstRouteDeps({
      findMany: async () => [],
      sendBtstAlert: async () => { throw new Error('network timeout'); },
    });

    try {
      await assert.rejects(
        () => withDiscoveryClock(() => runBtstAlertJob()),
        /network timeout/
      );
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 1, 'deleteMany must roll back on throw');
      const deleteArg = mocks.deleteManyCallArgs[0] as { where: { date: string; symbol: { in: string[] } } };
      assert.strictEqual(deleteArg.where.date, signalDate);
    } finally {
      mocks.restore();
    }
  });

  await t.test('empty payload: no Telegram send and no day claim retained', async () => {
    const mocks = mockBtstRouteDeps({
      discover: async () => [],
      create: async () => { throw new Error('claim should not be created for empty payload'); },
      sendBtstAlert: async () => { throw new Error('Telegram should not be called for empty payload'); },
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'no setups');
      assert.strictEqual(result.count, 0);
      assert.strictEqual(mocks.createCalls.length, 0);
      assert.strictEqual(mocks.sendCalls.length, 0);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('option enrichment throw skips only that symbol and still sends remaining alerts', async () => {
    const mocks = mockBtstRouteDeps({
      discover: async () => [
        makeTradableSignal({ id: 'ok-signal', symbol: 'GOOD' }),
        makeTradableSignal({ id: 'bad-signal', symbol: 'BAD' }),
      ],
      findMany: async () => [],
      suggestOptionForBtst: async (symbol) => {
        if (symbol === 'BAD') {
          throw new Error('option chain unavailable');
        }
        return { error: 'NO_CHAIN' };
      },
      sendBtstAlert: async (payload) => {
        const symbols = (payload as Array<{ symbol: string }>).map((row) => row.symbol);
        assert.deepStrictEqual(symbols, ['GOOD']);
        return { sent: true };
      },
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true);
      assert.strictEqual(result.count, 1);
      assert.strictEqual(result.longs, 1);
      assert.ok(mocks.createCalls.length >= 1, 'GOOD symbol must be claimed');
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteManyCallArgs.length, 0);
    } finally {
      mocks.restore();
    }
  });
});

test('BTST alert cron — alert-time journaling (alert ↔ journal parity)', async (t) => {
  await t.test('successful stock alert with option data is journaled immediately', async () => {
    const mocks = mockBtstRouteDeps({
      findMany: async () => [],
      suggestOptionForBtst: (async (symbol: string) => ({
        strike: 100,
        ltp: 4.2,
        formattedName: `${symbol} 100 CE`,
      })) as typeof OptionSuggestionService.suggestOptionForBtst,
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true);
      assert.deepStrictEqual(result.logged, ['TEST'], 'alerted symbol must be journaled');
      assert.strictEqual(mocks.journalCalls.length, 1);
      const entry = mocks.journalCalls[0] as Record<string, unknown>;
      assert.strictEqual(entry.signalType, 'BTST');
      assert.strictEqual(entry.symbol, 'TEST');
      assert.strictEqual(entry.optionType, 'CE');
      assert.strictEqual(entry.optionContract, '100 CE');
      assert.strictEqual(entry.entryCmp, 4.2);
      assert.strictEqual(entry.overnightSignalId, 'btst-alert-test-signal');
      assert.strictEqual(entry.signalSummary, 'STRONG_BTST,TRADEABLE,LONG,REGIME_BULL');
    } finally {
      mocks.restore();
    }
  });

  await t.test('index BTST alert is journaled with the INDEX tag', async () => {
    const indexSignal = makeTradableSignal({
      id: 'idx-nifty',
      symbol: 'NIFTY',
      instrumentType: 'INDEX',
      classification: 'INDEX_READY',
      direction: 'LONG',
      overnightScore: 110,
      confidence: 95,
    });
    const mocks = mockBtstRouteDeps({
      discover: async () => [], // no stock setups — index-only alert
      findMany: async () => [],
      overnightSignalFindMany: async () => [indexSignal],
      suggestOptionForBtst: (async (symbol: string) => ({
        strike: 24000,
        ltp: 150,
        formattedName: `${symbol} 24000 CE`,
      })) as typeof OptionSuggestionService.suggestOptionForBtst,
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true);
      assert.strictEqual(result.indexLongs, 1);
      assert.deepStrictEqual(result.logged, ['NIFTY']);
      const entry = mocks.journalCalls[0] as Record<string, unknown>;
      assert.strictEqual(entry.signalType, 'BTST');
      assert.strictEqual(entry.optionType, 'CE');
      assert.strictEqual(entry.optionContract, '24000 CE');
      assert.strictEqual(entry.overnightSignalId, 'idx-nifty');
      assert.strictEqual(entry.signalSummary, 'INDEX_READY,TRADEABLE,LONG,INDEX,REGIME_BULL');
    } finally {
      mocks.restore();
    }
  });

  await t.test('failed Telegram send never journals (claims rolled back instead)', async () => {
    const mocks = mockBtstRouteDeps({
      findMany: async () => [],
      suggestOptionForBtst: (async () => ({
        strike: 100,
        ltp: 4.2,
        formattedName: 'TEST 100 CE',
      })) as typeof OptionSuggestionService.suggestOptionForBtst,
      sendBtstAlert: async () => ({ sent: false, reason: 'telegram_api_error' }),
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, false);
      assert.strictEqual(mocks.journalCalls.length, 0, 'unsent alerts must not be journaled');
      assert.strictEqual(mocks.deleteManyCallArgs.length, 1);
    } finally {
      mocks.restore();
    }
  });

  await t.test('journal failure never breaks an already-sent alert', async () => {
    const mocks = mockBtstRouteDeps({
      findMany: async () => [],
      suggestOptionForBtst: (async () => ({
        strike: 100,
        ltp: 4.2,
        formattedName: 'TEST 100 CE',
      })) as typeof OptionSuggestionService.suggestOptionForBtst,
      logSignal: (async () => { throw new Error('journal db down'); }) as typeof TradeJournalService.logSignal,
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true, 'alert result must stand even if journaling fails');
      assert.deepStrictEqual(result.logged, [], 'no symbols journaled on failure');
      assert.strictEqual(mocks.deleteManyCallArgs.length, 0, 'claims must not be rolled back for journal errors');
    } finally {
      mocks.restore();
    }
  });

  await t.test('alert without option suggestion defers to the 15:25 journal job', async () => {
    // Default harness suggestion is { error: 'NO_CHAIN' } → no option data.
    const mocks = mockBtstRouteDeps({
      findMany: async () => [],
    });

    try {
      const result = await withDiscoveryClock(() => runBtstAlertJob());

      assert.strictEqual(result.sent, true);
      assert.deepStrictEqual(result.logged, []);
      assert.strictEqual(mocks.journalCalls.length, 0, 'no journal write without option strike/ltp');
    } finally {
      mocks.restore();
    }
  });
});

