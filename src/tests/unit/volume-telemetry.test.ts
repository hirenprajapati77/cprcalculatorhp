import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRangeProvenance, quoteSessionFields } from '@/lib/range-provenance';
import {
  VolumeTelemetryService,
  type VolumeTelemetryRow,
  type VolumeTelemetryPrismaClient,
} from '@/services/retention/volume-telemetry.service';
import type { MarketStockData } from '@/services/market.service';

function createMockStock(overrides: Partial<MarketStockData> = {}): MarketStockData {
  return {
    symbol: 'TCS',
    market: 'NSE',
    sector: 'IT',
    open: 3500,
    high: 3550,
    low: 3480,
    close: 3520,
    ltp: 3525,
    volume: 1200000,
    avgVolume: 2000000,
    marketCap: 1200000,
    rangeProvenance: 'FYERS_QUOTE',
    ...overrides,
  };
}

describe('resolveRangeProvenance', () => {
  it('returns FYERS_QUOTE when hasLiveQuotePrice is true', () => {
    const res = resolveRangeProvenance({ hasLiveQuotePrice: true, hasAggregatedIntraday: false, isTodayBar: false });
    assert.equal(res, 'FYERS_QUOTE');
  });

  it('FYERS_QUOTE takes precedence over aggregated intraday and today bar', () => {
    const res = resolveRangeProvenance({ hasLiveQuotePrice: true, hasAggregatedIntraday: true, isTodayBar: true });
    assert.equal(res, 'FYERS_QUOTE');
  });

  it('returns INTRADAY_TODAY_BAR when hasAggregatedIntraday is true and no quote price', () => {
    const res = resolveRangeProvenance({ hasLiveQuotePrice: false, hasAggregatedIntraday: true, isTodayBar: false });
    assert.equal(res, 'INTRADAY_TODAY_BAR');
  });

  it('returns INTRADAY_TODAY_BAR when isTodayBar is true and no quote price', () => {
    const res = resolveRangeProvenance({ hasLiveQuotePrice: false, hasAggregatedIntraday: false, isTodayBar: true });
    assert.equal(res, 'INTRADAY_TODAY_BAR');
  });

  it('returns STALE_PREV_DAY when all flags are false or undefined', () => {
    assert.equal(resolveRangeProvenance({}), 'STALE_PREV_DAY');
    assert.equal(resolveRangeProvenance({ hasLiveQuotePrice: false, isTodayBar: false }), 'STALE_PREV_DAY');
  });

  it('correctly handles partial inputs without falling back open', () => {
    assert.equal(resolveRangeProvenance({ hasLiveQuotePrice: false }), 'STALE_PREV_DAY');
  });
});

describe('quoteSessionFields', () => {
  it('returns all fields and hasLiveQuotePrice=true when high, low, and volume are all valid', () => {
    const res = quoteSessionFields({
      high_price: 105.5,
      low_price: 98.2,
      volume: 500000,
    });
    assert.equal(res.high, 105.5);
    assert.equal(res.low, 98.2);
    assert.equal(res.volume, 500000);
    assert.equal(res.hasLiveQuotePrice, true);
  });

  it('sets hasLiveQuotePrice=false when volume is missing, NaN, negative, or not a number', () => {
    assert.equal(quoteSessionFields({ high_price: 105, low_price: 98 }).hasLiveQuotePrice, false);
    assert.equal(quoteSessionFields({ high_price: 105, low_price: 98, volume: NaN }).hasLiveQuotePrice, false);
    assert.equal(quoteSessionFields({ high_price: 105, low_price: 98, volume: -1 }).hasLiveQuotePrice, false);
    assert.equal(quoteSessionFields({ high_price: 105, low_price: 98, volume: '500' as any }).hasLiveQuotePrice, false);
  });

  it('sets hasLiveQuotePrice=false when low is missing or non-positive (round-1 regression)', () => {
    const noLow = quoteSessionFields({ high_price: 105, volume: 500000 });
    assert.equal(noLow.low, null);
    assert.equal(noLow.hasLiveQuotePrice, false);

    const zeroLow = quoteSessionFields({ high_price: 105, low_price: 0, volume: 500000 });
    assert.equal(zeroLow.low, null);
    assert.equal(zeroLow.hasLiveQuotePrice, false);
  });

  it('preserves volume=0 as valid reading and sets hasLiveQuotePrice=true (zero volume case)', () => {
    const res = quoteSessionFields({
      high_price: 105,
      low_price: 98,
      volume: 0,
    });
    assert.equal(res.volume, 0);
    assert.equal(res.hasLiveQuotePrice, true);
  });

  it('allows per-field null fallback independently when some fields are invalid', () => {
    const last = { high: 100, low: 95, volume: 20000 };
    // high valid, low invalid, volume valid
    const partial = quoteSessionFields({ high_price: 105, low_price: 0, volume: 30000 });
    const resolvedHigh = partial.high ?? last.high;
    const resolvedLow = partial.low ?? last.low;
    const resolvedVol = partial.volume ?? last.volume;

    assert.equal(resolvedHigh, 105);
    assert.equal(resolvedLow, 95); // fell back to last
    assert.equal(resolvedVol, 30000);
    assert.equal(partial.hasLiveQuotePrice, false); // correctly flagged false because low fell back
  });
});

describe('VolumeTelemetryService.buildRows', () => {
  it('builds valid telemetry rows for stocks with positive avgVolume', () => {
    const stock = createMockStock({
      symbol: 'INFY',
      volume: 500000,
      avgVolume: 1000000,
      rangeProvenance: 'FYERS_QUOTE',
    });

    const now = new Date('2026-11-19T05:00:00.000Z'); // 10:30 IST
    const rows = VolumeTelemetryService.buildRows([stock], now);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].symbol, 'INFY');
    assert.equal(rows[0].date, '2026-11-19');
    assert.equal(rows[0].minuteOfDay, 630); // 10 * 60 + 30 = 630
    assert.equal(rows[0].sessionVolume, BigInt(500000));
    assert.equal(rows[0].avgVolume, BigInt(1000000));
    assert.equal(rows[0].rawRatio, 0.5);
    assert.equal(rows[0].rangeProvenance, 'FYERS_QUOTE');
  });

  it('uses explicit asOfDate when provided', () => {
    const stock = createMockStock();
    const rows = VolumeTelemetryService.buildRows([stock], new Date(), '2026-10-15');
    assert.equal(rows[0].date, '2026-10-15');
  });

  it('skips stocks without symbol or with empty symbol', () => {
    const stockNoSym = createMockStock({ symbol: '' });
    const rows = VolumeTelemetryService.buildRows([stockNoSym]);
    assert.equal(rows.length, 0);
  });

  it('skips stocks with zero or negative avgVolume', () => {
    const zeroAvg = createMockStock({ avgVolume: 0 });
    const negAvg = createMockStock({ avgVolume: -500 });
    const rows = VolumeTelemetryService.buildRows([zeroAvg, negAvg]);
    assert.equal(rows.length, 0);
  });

  it('defaults rangeProvenance to STALE_PREV_DAY if omitted on stock', () => {
    const stock = createMockStock({ rangeProvenance: undefined });
    const rows = VolumeTelemetryService.buildRows([stock]);
    assert.equal(rows[0].rangeProvenance, 'STALE_PREV_DAY');
  });

  it('floors negative or NaN volume to 0', () => {
    const stock = createMockStock({ volume: -100 });
    const rows = VolumeTelemetryService.buildRows([stock]);
    assert.equal(rows[0].sessionVolume, BigInt(0));
    assert.equal(rows[0].rawRatio, 0);
  });

  it('handles fractional avgVolume and volume without throwing (moving-average case)', () => {
    const stock = createMockStock({
      volume: 36967521.38095238,
      avgVolume: 36967521.38095238,
    });

    const rows = VolumeTelemetryService.buildRows([stock]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].sessionVolume, BigInt(Math.round(36967521.38095238)));
    assert.equal(rows[0].avgVolume, BigInt(Math.round(36967521.38095238)));
    assert.equal(rows[0].rawRatio, 1);
  });

  it('rounds fractional avgVolume to integer for BigInt storage', () => {
    const stock = createMockStock({
      volume: 500000,
      avgVolume: 1000000.7,
    });

    const rows = VolumeTelemetryService.buildRows([stock]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].avgVolume, BigInt(1000001));
    assert.equal(rows[0].sessionVolume, BigInt(500000));
    assert.equal(rows[0].rawRatio, 0.5);
  });
});

describe('VolumeTelemetryService.cutoffDate', () => {
  it('computes correct IST date string 30 days prior', () => {
    const now = new Date('2026-11-19T06:00:00.000Z');
    const cutoff = VolumeTelemetryService.cutoffDate(30, now);
    assert.equal(cutoff, '2026-10-20');
  });
});

describe('VolumeTelemetryService.record', () => {
  it('persists telemetry rows with injected client and skipDuplicates', async () => {
    let capturedData: any = null;
    let capturedSkipDuplicates: boolean | undefined = undefined;

    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async (args) => {
          capturedData = args.data;
          capturedSkipDuplicates = args.skipDuplicates;
          return { count: args.data.length };
        },
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
    };

    const row: VolumeTelemetryRow = {
      symbol: 'RELIANCE',
      date: '2026-11-19',
      minuteOfDay: 600,
      sessionVolume: BigInt(1000),
      avgVolume: BigInt(2000),
      rawRatio: 0.5,
      rangeProvenance: 'FYERS_QUOTE',
    };

    const count = await VolumeTelemetryService.record([row], mockClient);
    assert.equal(count, 1);
    assert.equal(capturedData.length, 1);
    assert.equal(capturedSkipDuplicates, true);
  });

  it('returns 0 without calling client when rows array is empty', async () => {
    let called = false;
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => {
          called = true;
          return { count: 0 };
        },
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
    };

    const count = await VolumeTelemetryService.record([], mockClient);
    assert.equal(count, 0);
    assert.equal(called, false);
  });

  it('catches client error and returns 0 gracefully', async () => {
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => {
          throw new Error('Database connection timeout');
        },
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
    };

    const row: VolumeTelemetryRow = {
      symbol: 'SBIN',
      date: '2026-11-19',
      minuteOfDay: 600,
      sessionVolume: BigInt(1000),
      avgVolume: BigInt(2000),
      rawRatio: 0.5,
      rangeProvenance: 'FYERS_QUOTE',
    };

    const count = await VolumeTelemetryService.record([row], mockClient);
    assert.equal(count, 0);
  });
});

describe('VolumeTelemetryService.purge', () => {
  it('purges records matching date < cutoffDate in bounded batches', async () => {
    const calls: any[] = [];
    let state = [
      { id: 1, date: '2026-10-01' },
      { id: 2, date: '2026-10-02' },
      { id: 3, date: '2026-10-03' },
    ];

    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async (args) => {
          calls.push({ findArgs: args });
          return state.slice(0, args.take).map((r) => ({ id: r.id }));
        },
        deleteMany: async (args) => {
          calls.push({ deleteArgs: args });
          const ids = args.where.id.in;
          state = state.filter((r) => !ids.includes(r.id));
          return { count: ids.length };
        },
      },
    };

    const res = await VolumeTelemetryService.purge('2026-10-20', mockClient, { batchSize: 2 });
    assert.equal(res.deleted, 3);
    assert.equal(res.batches, 2);
    assert.equal(res.capped, false);

    // Verify findArgs filtered on date, not createdAt
    assert.ok(calls[0].findArgs.where.date.lt, 'findMany must query date.lt');
    assert.equal(calls[0].findArgs.where.date.lt, '2026-10-20');
    assert.deepEqual(calls[0].findArgs.orderBy, { id: 'asc' });
  });

  it('stops immediately when no rows found', async () => {
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
    };

    const res = await VolumeTelemetryService.purge('2026-10-20', mockClient);
    assert.equal(res.deleted, 0);
    assert.equal(res.batches, 0);
    assert.equal(res.capped, false);
  });

  it('honors maxRows ceiling and sets capped=true', async () => {
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async (args) => {
          return Array.from({ length: args.take }, (_, idx) => ({ id: idx + 1 }));
        },
        deleteMany: async (args) => ({ count: args.where.id.in.length }),
      },
    };

    const res = await VolumeTelemetryService.purge('2026-10-20', mockClient, { batchSize: 200, maxRows: 500 });
    assert.equal(res.deleted, 500);
    assert.equal(res.batches, 3);
    assert.equal(res.capped, true);
  });

  it('stops before querying when maxRows is 0', async () => {
    let queried = false;
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async () => {
          queried = true;
          return [{ id: 1 }];
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    const res = await VolumeTelemetryService.purge('2026-10-20', mockClient, { maxRows: 0 });
    assert.equal(queried, false);
    assert.equal(res.deleted, 0);
    assert.equal(res.batches, 0);
  });

  it('caps batchSize to 1000 maximum to prevent unbounded batches', async () => {
    let capturedTake = 0;
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async (args) => {
          capturedTake = args.take;
          return [];
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    await VolumeTelemetryService.purge('2026-10-20', mockClient, { batchSize: 5000 });
    assert.equal(capturedTake, 1000);
  });

  it('defaults batchSize to 500 when options are omitted', async () => {
    let capturedTake = 0;
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async (args) => {
          capturedTake = args.take;
          return [];
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    await VolumeTelemetryService.purge('2026-10-20', mockClient);
    assert.equal(capturedTake, 500);
  });

  it('defaults maxRows to 25000 allowing deletion of full daily volume backlog (>10000 rows)', async () => {
    let loopCount = 0;
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async (args) => {
          loopCount++;
          // Simulate 30 batches of 500 = 15,000 rows (exceeds previous 10k ceiling)
          if (loopCount <= 30) {
            return Array.from({ length: args.take }, (_, idx) => ({ id: (loopCount - 1) * 500 + idx + 1 }));
          }
          return [];
        },
        deleteMany: async (args) => ({ count: args.where.id.in.length }),
      },
    };

    const res = await VolumeTelemetryService.purge('2026-10-20', mockClient);
    assert.equal(res.deleted, 15000);
    assert.equal(res.batches, 30);
    assert.equal(res.capped, false);
  });

  it('prunes multiple batches incrementally and accumulates total count', async () => {
    let callCount = 0;
    const mockClient: VolumeTelemetryPrismaClient = {
      volumeTelemetry: {
        createMany: async () => ({ count: 0 }),
        findMany: async (args) => {
          callCount++;
          if (callCount === 1) return [{ id: 10 }, { id: 11 }];
          if (callCount === 2) return [{ id: 12 }];
          return [];
        },
        deleteMany: async (args) => ({ count: args.where.id.in.length }),
      },
    };

    const res = await VolumeTelemetryService.purge('2026-10-20', mockClient, { batchSize: 2 });
    assert.equal(res.deleted, 3);
    assert.equal(res.batches, 2);
    assert.equal(res.capped, false);
  });
});
