import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { GET } from '../../app/api/cron/btst-alert/route';
import { prisma } from '../../lib/db';
import { env } from '../../config/env';
import { TelegramService } from '../../services/alert/telegram.service';
import { RegimeService } from '../../services/overnight/regime.service';
import { OvernightService } from '../../services/overnight/overnight.service';
import { IndexDiscoverService } from '../../services/overnight/index-discover.service';
import { getISTDateString } from '../../lib/market-hours';

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

function makeCronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/btst-alert', {
    headers: { 'x-cron-secret': env.CRON_SECRET ?? 'your_secure_cron_secret' },
  });
}

type BtstRouteMocks = {
  restore: () => void;
  createCalls: unknown[];
  deleteCalls: unknown[];
  sendCalls: unknown[];
};

function mockBtstRouteDeps(handlers: {
  create?: (args: unknown) => Promise<unknown>;
  delete?: (args: unknown) => Promise<unknown>;
  sendBtstAlert?: (payload: unknown) => Promise<{ sent: boolean; reason?: string }>;
}): BtstRouteMocks {
  const originalCreate = prisma.btstAlertState.create;
  const originalDelete = prisma.btstAlertState.delete;
  const originalRegime = RegimeService.getMarketRegime;
  const originalDiscover = OvernightService.discover;
  const originalIndexDiscover = IndexDiscoverService.discover;
  const originalOvernightSignalFindMany = prisma.overnightSignal.findMany;
  const originalSend = TelegramService.sendBtstAlert;

  const createCalls: unknown[] = [];
  const deleteCalls: unknown[] = [];
  const sendCalls: unknown[] = [];

  prisma.btstAlertState.create = (async (args: unknown) => {
    createCalls.push(args);
    if (handlers.create) {
      return handlers.create(args);
    }
    return { id: 1, date: getISTDateString(DISCOVERY_INSTANT), sentAt: new Date() };
  }) as unknown as typeof prisma.btstAlertState.create;

  prisma.btstAlertState.delete = (async (args: unknown) => {
    deleteCalls.push(args);
    if (handlers.delete) {
      return handlers.delete(args);
    }
    return { id: 1, date: getISTDateString(DISCOVERY_INSTANT), sentAt: new Date() };
  }) as unknown as typeof prisma.btstAlertState.delete;

  RegimeService.getMarketRegime = (async () => ({
    trend: 'BULL',
    volatility: 'LOW',
    score: 70,
  })) as typeof RegimeService.getMarketRegime;

  OvernightService.discover = (async () => []) as typeof OvernightService.discover;

  // Index BTST leg (added alongside stock discovery): no index signals today,
  // and no real overnightSignal table lookup — keeps this a pure unit test.
  IndexDiscoverService.discover = (async () => []) as typeof IndexDiscoverService.discover;
  prisma.overnightSignal.findMany = (async () => []) as unknown as typeof prisma.overnightSignal.findMany;

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
    sendCalls,
    restore: () => {
      prisma.btstAlertState.create = originalCreate;
      prisma.btstAlertState.delete = originalDelete;
      RegimeService.getMarketRegime = originalRegime;
      OvernightService.discover = originalDiscover;
      IndexDiscoverService.discover = originalIndexDiscover;
      prisma.overnightSignal.findMany = originalOvernightSignalFindMany;
      TelegramService.sendBtstAlert = originalSend;
    },
  };
}

test('BTST alert cron — BtstAlertState claim logic', async (t) => {
  await t.test('first claim of the day: create succeeds, send succeeds → sent true, no delete', async () => {
    const mocks = mockBtstRouteDeps({
      create: async () => ({ id: 1, date: getISTDateString(DISCOVERY_INSTANT), sentAt: new Date() }),
      sendBtstAlert: async () => ({ sent: true }),
    });

    try {
      const response = await withDiscoveryClock(() => GET(makeCronRequest()));
      const json = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(json.sent, true);
      assert.strictEqual(mocks.createCalls.length, 1);
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('concurrent second call: create P2002 → already sent, Telegram never called', async () => {
    const mocks = mockBtstRouteDeps({
      create: async () => {
        throw makeUniqueConstraintError();
      },
      sendBtstAlert: async () => {
        throw new Error('Telegram should not be called');
      },
    });

    try {
      const response = await withDiscoveryClock(() => GET(makeCronRequest()));
      const json = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(json.sent, false);
      assert.strictEqual(json.reason, 'already sent today');
      assert.strictEqual(mocks.createCalls.length, 1);
      assert.strictEqual(mocks.sendCalls.length, 0);
      assert.strictEqual(mocks.deleteCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('claim succeeds, Telegram returns sent false → delete claim, failure response', async () => {
    const signalDate = getISTDateString(DISCOVERY_INSTANT);
    const mocks = mockBtstRouteDeps({
      create: async () => ({ id: 1, date: signalDate, sentAt: new Date() }),
      sendBtstAlert: async () => ({ sent: false, reason: 'telegram_api_error' }),
    });

    try {
      const response = await withDiscoveryClock(() => GET(makeCronRequest()));
      const json = await response.json();

      assert.strictEqual(response.status, 200);
      assert.strictEqual(json.sent, false);
      assert.strictEqual(json.reason, 'telegram_api_error');
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteCalls.length, 1);
      assert.deepStrictEqual(
        (mocks.deleteCalls[0] as { where: { date: string } }).where,
        { date: signalDate }
      );
    } finally {
      mocks.restore();
    }
  });

  await t.test('claim succeeds, sendBtstAlert throws → delete claim, 500 response', async () => {
    const signalDate = getISTDateString(DISCOVERY_INSTANT);
    const mocks = mockBtstRouteDeps({
      create: async () => ({ id: 1, date: signalDate, sentAt: new Date() }),
      sendBtstAlert: async () => {
        throw new Error('network timeout');
      },
    });

    try {
      const response = await withDiscoveryClock(() => GET(makeCronRequest()));
      const json = await response.json();

      assert.strictEqual(response.status, 500);
      assert.strictEqual(json.error, 'network timeout');
      assert.strictEqual(mocks.sendCalls.length, 1);
      assert.strictEqual(mocks.deleteCalls.length, 1);
      assert.deepStrictEqual(
        (mocks.deleteCalls[0] as { where: { date: string } }).where,
        { date: signalDate }
      );
    } finally {
      mocks.restore();
    }
  });
});
