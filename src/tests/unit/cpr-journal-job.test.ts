import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../lib/db';
import { env, envSchemaForTests } from '../../config/env';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { TradeJournalService } from '../../services/journal/trade-journal.service';
import { runCprJournalJob } from '../../services/scheduler/cpr-journal.job';

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
    ltp: 105,
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

type Mocks = {
  restore: () => void;
  suggestCalls: string[];
  suggestArgs: Array<{ symbol: string; direction: 'LONG' | 'SHORT' }>;
  logCalls: unknown[];
  findManyArgs: unknown[];
};

function mockJobDeps(rows: ScannerRow[]): Mocks {
  const originalCount = prisma.scannerResult.count;
  const originalFindMany = prisma.scannerResult.findMany;
  const originalSuggest = OptionSuggestionService.suggestOptionForBtst;
  const originalLog = TradeJournalService.logSignal;

  const suggestCalls: string[] = [];
  const suggestArgs: Array<{ symbol: string; direction: 'LONG' | 'SHORT' }> = [];
  const logCalls: unknown[] = [];
  const findManyArgs: unknown[] = [];

  prisma.scannerResult.count = (async () => rows.length) as unknown as typeof prisma.scannerResult.count;
  prisma.scannerResult.findMany = (async (args: unknown) => {
    findManyArgs.push(args);
    const take = (args as { take?: number }).take ?? rows.length;
    return rows.slice(0, take);
  }) as unknown as typeof prisma.scannerResult.findMany;

  OptionSuggestionService.suggestOptionForBtst = (async (
    symbol: string,
    ltp: number,
    direction: 'LONG' | 'SHORT'
  ) => {
    suggestCalls.push(symbol);
    suggestArgs.push({ symbol, direction });
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
      makeSignal({ symbol: 'TRIG', ltp: 105, entry: 100 }),
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

  await t.test('bearish signal checks trigger correctly and log PE options', async (t) => {
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
    const mocks = mockJobDeps([makeSignal({ symbol: 'NOCHAIN', ltp: 105, entry: 100 })]);
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
      assert.strictEqual(logCall.entryCmp, 105);
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
