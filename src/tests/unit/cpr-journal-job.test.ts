import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../lib/db';
import { env, envSchemaForTests } from '../../config/env';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { TradeJournalService } from '../../services/journal/trade-journal.service';
import { MarketService } from '../../services/market.service';
import { runCprJournalJob } from '../../services/scheduler/cpr-journal.job';
import type { MarketStockData } from '../../services/market.service';

type ScannerRow = {
  symbol: string;
  ltp: number;
  entry: number;
  sl: number;
  target: number;
  score: number;
  confidence: number;
  signalSummary: string;
  tc?: number;
  bc?: number;
};

function makeSignal(overrides: Partial<ScannerRow> = {}): ScannerRow {
  return {
    symbol: 'TEST',
    // Keep LTP within ±3.5% of entry so the price-staleness gate does not fire
    // unless a test intentionally extends/gaps.
    ltp: 103,
    entry: 100,
    sl: 98,
    target: 110,
    score: 80,
    confidence: 85,
    signalSummary: 'BULLISH,ABOVE_TC',
    tc: 100,
    bc: 98,
    ...overrides,
  };
}

type MarketFixture = Partial<MarketStockData> | null | 'throw';

type Mocks = {
  restore: () => void;
  suggestCalls: string[];
  suggestArgs: Array<{ symbol: string; direction: 'LONG' | 'SHORT'; ltp: number }>;
  logCalls: unknown[];
  findManyArgs: unknown[];
};

function mockJobDeps(
  rows: ScannerRow[],
  marketBySymbol: Record<string, MarketFixture> = {}
): Mocks {
  const originalCount = prisma.scannerResult.count;
  const originalFindMany = prisma.scannerResult.findMany;
  const originalSuggest = OptionSuggestionService.suggestOptionForBtst;
  const originalLog = TradeJournalService.logSignal;
  const originalGetStock = MarketService.getStockData;

  const suggestCalls: string[] = [];
  const suggestArgs: Array<{ symbol: string; direction: 'LONG' | 'SHORT'; ltp: number }> = [];
  const logCalls: unknown[] = [];
  const findManyArgs: unknown[] = [];

  prisma.scannerResult.count = (async () => rows.length) as unknown as typeof prisma.scannerResult.count;
  prisma.scannerResult.findMany = (async (args: unknown) => {
    findManyArgs.push(args);
    const take = (args as { take?: number }).take ?? rows.length;
    return rows.slice(0, take);
  }) as unknown as typeof prisma.scannerResult.findMany;

  MarketService.getStockData = (async (symbol: string) => {
    const key = symbol.toUpperCase();
    const fixture = marketBySymbol[key] ?? marketBySymbol[symbol] ?? null;
    if (fixture === 'throw') throw new Error('market down');
    if (fixture == null) return null;
    return {
      symbol: key,
      market: 'NSE',
      sector: 'Other',
      open: fixture.open ?? fixture.ltp ?? 100,
      high: fixture.high ?? 0,
      low: fixture.low ?? 0,
      close: fixture.close ?? fixture.ltp ?? 100,
      ltp: fixture.ltp ?? 100,
      volume: 0,
      avgVolume: 0,
      marketCap: 0,
      history: [],
      previousClose: fixture.previousClose,
      ...fixture,
    } as MarketStockData;
  }) as unknown as typeof MarketService.getStockData;

  OptionSuggestionService.suggestOptionForBtst = (async (
    symbol: string,
    ltp: number,
    direction: 'LONG' | 'SHORT'
  ) => {
    suggestCalls.push(symbol);
    suggestArgs.push({ symbol, direction, ltp });
    const optionType = direction === 'SHORT' ? 'PE' : 'CE';
    return { strike: 100, ltp: 5.5, formattedName: `${symbol} 100 ${optionType}` };
  }) as unknown as typeof OptionSuggestionService.suggestOptionForBtst;

  TradeJournalService.logSignal = (async (params: unknown) => {
    logCalls.push(params);
    return true;
  }) as unknown as typeof TradeJournalService.logSignal;

  return {
    restore: () => {
      prisma.scannerResult.count = originalCount;
      prisma.scannerResult.findMany = originalFindMany;
      OptionSuggestionService.suggestOptionForBtst = originalSuggest;
      TradeJournalService.logSignal = originalLog;
      MarketService.getStockData = originalGetStock;
    },
    suggestCalls,
    suggestArgs,
    logCalls,
    findManyArgs,
  };
}

test('runCprJournalJob entry-trigger and sector-divergence gates', async (t) => {
  await t.test('skips signal whose LTP never reached the entry trigger', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'NOTRIG', ltp: 95, entry: 100 }),
      makeSignal({ symbol: 'TRIG', ltp: 103, entry: 100 }),
    ]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['NOTRIG']);
      assert.deepStrictEqual(result.logged, ['TRIG']);
      assert.deepStrictEqual(
        mocks.suggestCalls,
        ['TRIG'],
        'no option-chain lookup may happen for an untriggered signal'
      );
    } finally {
      mocks.restore();
    }
  });

  await t.test('LTP exactly at entry counts as triggered', async () => {
    const mocks = mockJobDeps([makeSignal({ symbol: 'ATENTRY', ltp: 100, entry: 100 })]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['ATENTRY']);
    } finally {
      mocks.restore();
    }
  });

  await t.test('legacy rows with entry=0 default pass the trigger gate', async () => {
    const mocks = mockJobDeps([makeSignal({ symbol: 'LEGACY', ltp: 50, entry: 0 })]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['LEGACY']);
    } finally {
      mocks.restore();
    }
  });

  await t.test('bearish signal checks trigger correctly and log PE options', async (_t) => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'BEARTRIG', ltp: 97, entry: 98, bc: 98, tc: 100 }),
      makeSignal({ symbol: 'BEARSKIP', ltp: 99, entry: 98, bc: 98, tc: 100 }),
    ]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['BEARSKIP']);
      assert.deepStrictEqual(result.logged, ['BEARTRIG']);

      const targetCall = mocks.suggestArgs.find(c => c.symbol === 'BEARTRIG');
      assert.ok(targetCall);
      assert.strictEqual(targetCall.direction, 'SHORT');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logCall = mocks.logCalls.find((c: any) => c.symbol === 'BEARTRIG') as any;
      assert.ok(logCall);
      assert.strictEqual(logCall.optionType, 'PE');
      assert.strictEqual(logCall.optionContract, '100 PE');
    } finally {
      mocks.restore();
    }
  });

  await t.test('RANGE short (pivot entry, SL above) journals PE when LTP ≤ entry', async () => {
    const mocks = mockJobDeps([
      makeSignal({
        symbol: 'RANGESHORT',
        ltp: 99.5,
        entry: 100,
        sl: 100.5,
        target: 97,
        tc: 102,
        bc: 98,
        signalSummary: 'RANGE,BELOW_PIVOT',
      }),
      makeSignal({
        symbol: 'RANGESKIP',
        ltp: 100.5,
        entry: 100,
        sl: 100.5,
        target: 97,
        tc: 102,
        bc: 98,
        signalSummary: 'RANGE,BELOW_PIVOT',
      }),
    ]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['RANGESKIP']);
      assert.deepStrictEqual(result.logged, ['RANGESHORT']);
      const call = mocks.suggestArgs.find((c) => c.symbol === 'RANGESHORT');
      assert.strictEqual(call?.direction, 'SHORT');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logCall = mocks.logCalls.find((c: any) => c.symbol === 'RANGESHORT') as any;
      assert.strictEqual(logCall.optionType, 'PE');
    } finally {
      mocks.restore();
    }
  });

  await t.test('journals UNDERLYING stock LTP when option chain is unavailable', async () => {
    const mocks = mockJobDeps([makeSignal({ symbol: 'NOCHAIN', ltp: 103, entry: 100 })]);
    OptionSuggestionService.suggestOptionForBtst = (async () => ({
      error: 'NO_CHAIN',
    })) as unknown as typeof OptionSuggestionService.suggestOptionForBtst;
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['NOCHAIN']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logCall = mocks.logCalls[0] as any;
      assert.strictEqual(logCall.optionContract, 'UNDERLYING CE');
      assert.strictEqual(logCall.optionStrike, 0);
      assert.strictEqual(logCall.entryCmp, 103);
    } finally {
      mocks.restore();
    }
  });

  await t.test('UNDERLYING fallback uses PE for bearish CPR signals', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'NOCHAINBEAR', ltp: 97, entry: 98, bc: 98, tc: 100 }),
    ]);
    OptionSuggestionService.suggestOptionForBtst = (async () => ({
      error: 'NO_CHAIN',
    })) as unknown as typeof OptionSuggestionService.suggestOptionForBtst;
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['NOCHAINBEAR']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logCall = mocks.logCalls[0] as any;
      assert.strictEqual(logCall.optionContract, 'UNDERLYING PE');
      assert.strictEqual(logCall.optionType, 'PE');
      assert.strictEqual(logCall.entryCmp, 97);
    } finally {
      mocks.restore();
    }
  });

  await t.test('SECTOR_DIVERGENCE skips journaling only in live filter mode', async () => {
    const divergent = makeSignal({
      symbol: 'DIVERGED',
      signalSummary: 'BULLISH,ABOVE_TC,SECTOR_DIVERGENCE',
    });
    const originalMode = env.SECTOR_FILTER_MODE;

    // Shadow mode (default): tag never blocks.
    env.SECTOR_FILTER_MODE = 'shadow';
    let mocks = mockJobDeps([divergent]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['DIVERGED'], 'shadow mode must not block journaling');
    } finally {
      mocks.restore();
    }

    // Live mode: tag blocks.
    env.SECTOR_FILTER_MODE = 'live';
    mocks = mockJobDeps([divergent]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['DIVERGED'], 'live mode must skip divergent signals');
      assert.strictEqual(mocks.suggestCalls.length, 0);
    } finally {
      mocks.restore();
      env.SECTOR_FILTER_MODE = originalMode;
    }
  });

  await t.test('findMany take is driven by CPR_JOURNAL_MAX_SIGNALS', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeSignal({ symbol: `S${i}` }));
    const originalMax = env.CPR_JOURNAL_MAX_SIGNALS;
    env.CPR_JOURNAL_MAX_SIGNALS = 3;
    const mocks = mockJobDeps(rows);
    try {
      const result = await runCprJournalJob();
      assert.strictEqual((mocks.findManyArgs[0] as { take: number }).take, 3);
      assert.strictEqual(result.logged.length, 3);
    } finally {
      mocks.restore();
      env.CPR_JOURNAL_MAX_SIGNALS = originalMax;
    }
  });

  await t.test('skips GAP_INVALIDATED when live OHLC leaves entry unreachable', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'GODREJCP', ltp: 940, entry: 1034.2, bc: 1034.2, tc: 1050, sl: 1060, target: 1000 })],
      {
        GODREJCP: { ltp: 940, high: 951.8, low: 922.5, open: 945, previousClose: 1030 },
      }
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['GODREJCP:GAP_INVALIDATED']);
      assert.deepStrictEqual(result.logged, []);
      assert.strictEqual(mocks.suggestCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('skips EXTENDED when LTP chased past entry without market OHLC', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'CHASE', ltp: 105, entry: 100 }),
    ]);
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['CHASE:EXTENDED']);
      assert.deepStrictEqual(result.logged, []);
    } finally {
      mocks.restore();
    }
  });

  await t.test('uses live LTP for option suggest when market data is fresh', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'LIVE', ltp: 101, entry: 100 })],
      { LIVE: { ltp: 102.5, high: 103, low: 99.8, open: 101, previousClose: 99.5 } }
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['LIVE']);
      assert.strictEqual(mocks.suggestArgs[0]?.ltp, 102.5);
    } finally {
      mocks.restore();
    }
  });

  await t.test('parallel execution: one signal throwing an unexpected error does not block the rest', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'ERRORSYMBOL', ltp: 103, entry: 100 }),
      makeSignal({ symbol: 'GOODSYMBOL', ltp: 103, entry: 100 }),
    ]);

    const originalLog = TradeJournalService.logSignal;
    TradeJournalService.logSignal = (async (params: any) => {
      if (params.symbol === 'ERRORSYMBOL') throw new Error('Uncaught exception in parallel block');
      return originalLog(params);
    }) as unknown as typeof TradeJournalService.logSignal;

    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['ERRORSYMBOL:UNCAUGHT_ERROR']);
      assert.deepStrictEqual(result.logged, ['GOODSYMBOL']);
    } finally {
      TradeJournalService.logSignal = originalLog;
      mocks.restore();
    }
  });
});

test('CPR_JOURNAL_MAX_SIGNALS env schema rejects unsafe values', () => {
  const base = { APP_ACCESS_TOKEN: 'test-token-123' };
  const parse = (value: string) =>
    envSchemaForTests.safeParse({ ...base, CPR_JOURNAL_MAX_SIGNALS: value });

  assert.strictEqual(parse('5').success, true, 'positive integer is valid');
  assert.strictEqual(parse('0').success, false, '0 would silently disable journaling');
  assert.strictEqual(parse('-3').success, false, 'negative flips Prisma take to "from the end"');
  assert.strictEqual(parse('2.5').success, false, 'float makes Prisma throw at runtime');
  assert.strictEqual(parse('abc').success, false, 'non-numeric must be rejected');

  const defaulted = envSchemaForTests.safeParse(base);
  assert.strictEqual(defaulted.success, true);
  if (defaulted.success) {
    assert.strictEqual(defaulted.data.CPR_JOURNAL_MAX_SIGNALS, 5, 'default cap is 5');
  }
});
