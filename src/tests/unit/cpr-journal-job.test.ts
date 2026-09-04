import test from 'node:test';
import assert from 'node:assert';
import { prisma } from '../../lib/db';
import { env, envSchemaForTests } from '../../config/env';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { TradeJournalService } from '../../services/journal/trade-journal.service';
import { MarketService } from '../../services/market.service';
import { RegimeService } from '../../services/overnight/regime.service';
import { runCprJournalJob } from '../../services/scheduler/cpr-journal.job';
import type { MarketStockData } from '../../services/market.service';
import type { MarketRegime } from '../../services/overnight/regime.service';

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
    // Keep LTP within ±1.2% of entry so the price-staleness gate does not fire
    // unless a test intentionally extends/gaps.
    ltp: 101.2,
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

// Default regime = CHOPPY so existing tests are unaffected by the new regime gate.
const DEFAULT_REGIME: MarketRegime = { trend: 'CHOPPY', volatility: 'LOW', score: 50, reliable: true };

function mockJobDeps(
  rows: ScannerRow[],
  marketBySymbol: Record<string, MarketFixture> = {},
  regime: MarketRegime = DEFAULT_REGIME
): Mocks {
  const originalCount = prisma.scannerResult.count;
  const originalFindMany = prisma.scannerResult.findMany;
  const originalSuggest = OptionSuggestionService.suggestOption;
  const originalLog = TradeJournalService.logSignal;
  const originalGetStock = MarketService.getStockData;
  const originalGetRegime = RegimeService.getMarketRegime;

  // Stub regime so the job doesn't hit Nifty history network calls in tests.
  RegimeService.getMarketRegime = (async () => regime) as unknown as typeof RegimeService.getMarketRegime;

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

  OptionSuggestionService.suggestOption = (async (
    symbol: string,
    ltp: number,
    bias: 'BULLISH' | 'BEARISH'
  ) => {
    suggestCalls.push(symbol);
    suggestArgs.push({
      symbol,
      direction: bias === 'BEARISH' ? 'SHORT' : 'LONG',
      ltp,
    });
    const optionType = bias === 'BEARISH' ? 'PE' : 'CE';
    return { strike: 100, ltp: 5.5, formattedName: `${symbol} 100 ${optionType}` };
  }) as unknown as typeof OptionSuggestionService.suggestOption;

  TradeJournalService.logSignal = (async (params: unknown) => {
    logCalls.push(params);
    return true;
  }) as unknown as typeof TradeJournalService.logSignal;

  return {
    restore: () => {
      prisma.scannerResult.count = originalCount;
      prisma.scannerResult.findMany = originalFindMany;
      OptionSuggestionService.suggestOption = originalSuggest;
      TradeJournalService.logSignal = originalLog;
      MarketService.getStockData = originalGetStock;
      RegimeService.getMarketRegime = originalGetRegime;
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
      makeSignal({ symbol: 'TRIG', ltp: 101.2, entry: 100 }),
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
       
      const logCall = mocks.logCalls.find((c: any) => c.symbol === 'RANGESHORT') as any;
      assert.strictEqual(logCall.optionType, 'PE');
    } finally {
      mocks.restore();
    }
  });

  await t.test('journals UNDERLYING stock LTP when option chain is unavailable', async () => {
    const mocks = mockJobDeps([makeSignal({ symbol: 'NOCHAIN', ltp: 101.2, entry: 100 })]);
    OptionSuggestionService.suggestOption = (async () => ({
      error: 'NO_CHAIN',
    })) as unknown as typeof OptionSuggestionService.suggestOption;
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['NOCHAIN']);
       
      const logCall = mocks.logCalls[0] as any;
      assert.strictEqual(logCall.optionContract, 'UNDERLYING CE');
      assert.strictEqual(logCall.optionStrike, 0);
      assert.strictEqual(logCall.entryCmp, 101.2);
    } finally {
      mocks.restore();
    }
  });

  await t.test('UNDERLYING fallback uses PE for bearish CPR signals', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'NOCHAINBEAR', ltp: 97, entry: 98, bc: 98, tc: 100 }),
    ]);
    OptionSuggestionService.suggestOption = (async () => ({
      error: 'NO_CHAIN',
    })) as unknown as typeof OptionSuggestionService.suggestOption;
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['NOCHAINBEAR']);
       
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
      assert.strictEqual((mocks.findManyArgs[0] as { take: number }).take, 9);
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

  await t.test('skips AGAINST_PRIOR_CLOSE when LONG LTP is still below previous close', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'LICI', ltp: 415.35, entry: 414.95, tc: 414.95, bc: 410, sl: 410.1, target: 425.2 })],
      { LICI: { ltp: 415.35, high: 416.35, low: 414, open: 415.35, previousClose: 417 } }
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['LICI:AGAINST_PRIOR_CLOSE']);
      assert.deepStrictEqual(result.logged, []);
      assert.strictEqual(mocks.suggestCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('uses live LTP for option suggest when market data is fresh', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'LIVE', ltp: 101, entry: 100 })],
      { LIVE: { ltp: 101.2, high: 103, low: 99.8, open: 101, previousClose: 100.5 } }
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['LIVE']);
      assert.strictEqual(mocks.suggestArgs[0]?.ltp, 101.2);
    } finally {
      mocks.restore();
    }
  });

  await t.test('parallel execution: one signal throwing an unexpected error does not block the rest', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'ERRORSYMBOL', ltp: 101.2, entry: 100 }),
      makeSignal({ symbol: 'GOODSYMBOL', ltp: 101.2, entry: 100 }),
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

  await t.test('skips signal when OptionSuggestion PCR contradicts direction', async () => {
    const mocks = mockJobDeps([
      makeSignal({ symbol: 'AMBER', ltp: 101.2, entry: 100 }),
    ]);

    const originalSuggest = OptionSuggestionService.suggestOption;
    // Mock AMBER with CE option but bearish chain PCR (0.61)
    OptionSuggestionService.suggestOption = (async () => ({
      strike: 7300,
      ltp: 150.1,
      type: 'CE',
      pcr: 0.61,
      formattedName: 'AMBER 7300 CE',
    })) as unknown as typeof OptionSuggestionService.suggestOption;

    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.skipped, ['AMBER:PCR_CONTRADICTS']);
      assert.deepStrictEqual(result.logged, []);
    } finally {
      OptionSuggestionService.suggestOption = originalSuggest;
      mocks.restore();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Regime Suppression Tests (Fix 1)
// ────────────────────────────────────────────────────────────────────────────
test('runCprJournalJob regime suppression gate', async (t) => {
  await t.test('BULL regime suppresses SHORT (PE) signals — core FORTIS guard', async () => {
    const bullRegime: MarketRegime = { trend: 'BULL', volatility: 'LOW', score: 80, reliable: true };
    // Bearish signal (entry=bc → SHORT direction)
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'FORTIS', ltp: 97, entry: 98, bc: 98, tc: 100, signalSummary: 'BEARISH,BREAKDOWN' })],
      {},
      bullRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, [], 'FORTIS SHORT must be suppressed in BULL regime');
      assert.ok(
        result.skipped.some((s) => s.includes('REGIME_SUPPRESSED')),
        `Expected REGIME_SUPPRESSED in skipped, got: ${JSON.stringify(result.skipped)}`
      );
      assert.strictEqual(mocks.suggestCalls.length, 0, 'Option chain must NOT be queried for suppressed signals');
    } finally {
      mocks.restore();
    }
  });

  await t.test('BULL regime allows LONG (CE) signals through', async () => {
    const bullRegime: MarketRegime = { trend: 'BULL', volatility: 'LOW', score: 80, reliable: true };
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'RELIANCE', ltp: 101.2, entry: 100, tc: 100, bc: 98, signalSummary: 'BULLISH,ABOVE_TC' })],
      {},
      bullRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['RELIANCE'], 'LONG signal must be allowed in BULL regime');
    } finally {
      mocks.restore();
    }
  });

  await t.test('BEAR regime suppresses LONG (CE) signals', async () => {
    const bearRegime: MarketRegime = { trend: 'BEAR', volatility: 'LOW', score: 20, reliable: true };
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'HDFC', ltp: 101.2, entry: 100, tc: 100, bc: 98, signalSummary: 'BULLISH,ABOVE_TC' })],
      {},
      bearRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, [], 'LONG (CE) must be suppressed in BEAR regime');
      assert.ok(result.skipped.some((s) => s.includes('REGIME_SUPPRESSED')));
    } finally {
      mocks.restore();
    }
  });

  await t.test('BEAR regime allows SHORT (PE) signals through', async () => {
    const bearRegime: MarketRegime = { trend: 'BEAR', volatility: 'LOW', score: 20, reliable: true };
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'ICICI', ltp: 97, entry: 98, bc: 98, tc: 100, signalSummary: 'BEARISH,BREAKDOWN' })],
      {},
      bearRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['ICICI'], 'SHORT signal must be allowed in BEAR regime');
    } finally {
      mocks.restore();
    }
  });

  await t.test('unreliable regime (reliable=false) suppresses all signals — fail-closed', async () => {
    const unreliableRegime: MarketRegime = { trend: 'CHOPPY', volatility: 'LOW', score: 50, reliable: false };
    const mocks = mockJobDeps(
      [
        makeSignal({ symbol: 'LONG_SYM', ltp: 101.2, entry: 100, tc: 100, bc: 98 }),
        makeSignal({ symbol: 'SHORT_SYM', ltp: 97, entry: 98, bc: 98, tc: 100 }),
      ],
      {},
      unreliableRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, [], 'All signals must be suppressed when regime is unreliable');
      assert.strictEqual(
        result.skipped.filter((s) => s.includes('REGIME_SUPPRESSED')).length,
        2,
        'Both signals must appear as REGIME_SUPPRESSED'
      );
    } finally {
      mocks.restore();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Signal Confluence / Direction Contradiction Tests (Fix 2)
// ────────────────────────────────────────────────────────────────────────────
test('runCprJournalJob signal confluence gate', async (t) => {
  // CHOPPY regime allows both directions — so regime gate does NOT interfere here.
  const choppyRegime: MarketRegime = { trend: 'CHOPPY', volatility: 'LOW', score: 50, reliable: true };

  await t.test('rejects SHORT setup with GAP_UP tag — exact FORTIS scenario', async () => {
    const mocks = mockJobDeps(
      [
        makeSignal({
          symbol: 'FORTIS',
          ltp: 97,
          entry: 98,
          bc: 98,
          tc: 100,
          // FORTIS had GAP_UP alongside BEARISH — the smoking gun
          signalSummary: 'OVERLAPPING_VALUE,HP_CAM_BULL_BIAS,GAP_UP,BEARISH,BREAKDOWN',
        }),
      ],
      {},
      choppyRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, []);
      assert.ok(
        result.skipped.some((s) => s.includes('DIRECTION_CONFLICT')),
        `Expected DIRECTION_CONFLICT in skipped, got: ${JSON.stringify(result.skipped)}`
      );
      assert.strictEqual(mocks.suggestCalls.length, 0);
    } finally {
      mocks.restore();
    }
  });

  await t.test('rejects SHORT setup with HP_CAM_BULL_BIAS tag', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'AAPL', ltp: 97, entry: 98, bc: 98, tc: 100, signalSummary: 'BEARISH,HP_CAM_BULL_BIAS' })],
      {},
      choppyRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.ok(result.skipped.some((s) => s.includes('DIRECTION_CONFLICT:HP_CAM_BULL_BIAS')));
    } finally {
      mocks.restore();
    }
  });

  await t.test('rejects LONG setup with GAP_DOWN tag', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'SBIN', ltp: 101.2, entry: 100, tc: 100, bc: 98, signalSummary: 'BULLISH,GAP_DOWN,ABOVE_TC' })],
      {},
      choppyRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.ok(result.skipped.some((s) => s.includes('DIRECTION_CONFLICT:GAP_DOWN')));
    } finally {
      mocks.restore();
    }
  });

  await t.test('allows SHORT setup with no contradictory tags', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'CLEANSHORT', ltp: 97, entry: 98, bc: 98, tc: 100, signalSummary: 'BEARISH,BREAKDOWN,RSI_BEARISH' })],
      {},
      choppyRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['CLEANSHORT'], 'Clean SHORT setup must pass confluence gate');
    } finally {
      mocks.restore();
    }
  });

  await t.test('allows LONG setup with no contradictory tags', async () => {
    const mocks = mockJobDeps(
      [makeSignal({ symbol: 'CLEANLONG', ltp: 101.2, entry: 100, tc: 100, bc: 98, signalSummary: 'BULLISH,ABOVE_TC,RSI_BULLISH' })],
      {},
      choppyRegime
    );
    try {
      const result = await runCprJournalJob();
      assert.deepStrictEqual(result.logged, ['CLEANLONG'], 'Clean LONG setup must pass confluence gate');
    } finally {
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
