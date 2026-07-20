import test from 'node:test';
import assert from 'node:assert';
import { env } from '../../config/env';
import { prisma } from '../../lib/db';
import { EventCalendarService } from '../../services/overnight/event.service';

const SIGNAL_DATE = '2026-07-20';

function mockEmptyMarketEventTable() {
  const originalFindMany = prisma.marketEvent.findMany;
  const originalFindFirst = prisma.marketEvent.findFirst;

  prisma.marketEvent.findMany = (async () => []) as unknown as typeof prisma.marketEvent.findMany;
  prisma.marketEvent.findFirst = (async () => null) as unknown as typeof prisma.marketEvent.findFirst;

  return () => {
    prisma.marketEvent.findMany = originalFindMany;
    prisma.marketEvent.findFirst = originalFindFirst;
  };
}

test('EventCalendarService — EVENT_CALENDAR_ENFORCE_FRESHNESS flag', async (t) => {
  await t.test('getEventRisk: flag false → severity 0 on empty calendar', async () => {
    const restorePrisma = mockEmptyMarketEventTable();
    const originalHistMode = env.HISTORICAL_MODE;
    const originalEnforce = env.EVENT_CALENDAR_ENFORCE_FRESHNESS;

    env.HISTORICAL_MODE = 'live';
    env.EVENT_CALENDAR_ENFORCE_FRESHNESS = 'false';

    try {
      const result = await EventCalendarService.getEventRisk('SBIN', SIGNAL_DATE);
      assert.strictEqual(result.severity, 0);
      assert.strictEqual(result.reason, null);
    } finally {
      env.HISTORICAL_MODE = originalHistMode;
      env.EVENT_CALENDAR_ENFORCE_FRESHNESS = originalEnforce;
      restorePrisma();
    }
  });

  await t.test('getEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar', async () => {
    const restorePrisma = mockEmptyMarketEventTable();
    const originalHistMode = env.HISTORICAL_MODE;
    const originalEnforce = env.EVENT_CALENDAR_ENFORCE_FRESHNESS;

    env.HISTORICAL_MODE = 'live';
    env.EVENT_CALENDAR_ENFORCE_FRESHNESS = 'true';

    try {
      const result = await EventCalendarService.getEventRisk('SBIN', SIGNAL_DATE);
      assert.strictEqual(result.severity, 100);
      assert.strictEqual(result.reason, 'STALE_CALENDAR_FALLBACK');
    } finally {
      env.HISTORICAL_MODE = originalHistMode;
      env.EVENT_CALENDAR_ENFORCE_FRESHNESS = originalEnforce;
      restorePrisma();
    }
  });

  await t.test('getBulkEventRisk: flag false → severity 0 on empty calendar', async () => {
    const restorePrisma = mockEmptyMarketEventTable();
    const originalHistMode = env.HISTORICAL_MODE;
    const originalEnforce = env.EVENT_CALENDAR_ENFORCE_FRESHNESS;

    env.HISTORICAL_MODE = 'live';
    env.EVENT_CALENDAR_ENFORCE_FRESHNESS = 'false';

    try {
      const result = await EventCalendarService.getBulkEventRisk(['SBIN'], SIGNAL_DATE);
      assert.strictEqual(result.SBIN.severity, 0);
      assert.strictEqual(result.SBIN.reason, null);
    } finally {
      env.HISTORICAL_MODE = originalHistMode;
      env.EVENT_CALENDAR_ENFORCE_FRESHNESS = originalEnforce;
      restorePrisma();
    }
  });

  await t.test('getBulkEventRisk: flag true → STALE_CALENDAR_FALLBACK on empty calendar', async () => {
    const restorePrisma = mockEmptyMarketEventTable();
    const originalHistMode = env.HISTORICAL_MODE;
    const originalEnforce = env.EVENT_CALENDAR_ENFORCE_FRESHNESS;

    env.HISTORICAL_MODE = 'live';
    env.EVENT_CALENDAR_ENFORCE_FRESHNESS = 'true';

    try {
      const result = await EventCalendarService.getBulkEventRisk(['SBIN'], SIGNAL_DATE);
      assert.strictEqual(result.SBIN.severity, 100);
      assert.strictEqual(result.SBIN.reason, 'STALE_CALENDAR_FALLBACK');
    } finally {
      env.HISTORICAL_MODE = originalHistMode;
      env.EVENT_CALENDAR_ENFORCE_FRESHNESS = originalEnforce;
      restorePrisma();
    }
  });
});
