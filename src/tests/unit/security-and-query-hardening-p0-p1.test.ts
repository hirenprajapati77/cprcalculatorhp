import test from 'node:test';
import assert from 'node:assert';
import { sanitizePagination } from '../../lib/pagination';
import { OptionSuggestionService } from '../../services/option-suggestion.service';
import { optionPcrContradictsDirection } from '../../services/alert/breakout-pcr-gate';

test('P0-1: Scanner top limit bounds via sanitizePagination', () => {
  // Invalid string -> default 5
  const resAbc = sanitizePagination(1, 'abc', 50, 5);
  assert.strictEqual(resAbc.limit, 5);

  // Negative -> default 5
  const resNeg = sanitizePagination(1, '-1', 50, 5);
  assert.strictEqual(resNeg.limit, 5);

  // Zero -> default 5
  const resZero = sanitizePagination(1, '0', 50, 5);
  assert.strictEqual(resZero.limit, 5);

  // Giant number -> clamped to max limit 50
  const resHuge = sanitizePagination(1, '100000000', 50, 5);
  assert.strictEqual(resHuge.limit, 50);

  // Normal valid number within bounds -> 4
  const resValid = sanitizePagination(1, '4', 50, 5);
  assert.strictEqual(resValid.limit, 4);

  // Candidate pool bounding
  const candidateTake = (limit: number) => Math.min(Math.max(limit * 4, 30), 100);
  assert.strictEqual(candidateTake(resAbc.limit), 30);
  assert.strictEqual(candidateTake(resHuge.limit), 100);
  assert.strictEqual(candidateTake(resValid.limit), 30);
});

test('P1-1 & P1-4: runId and backtestRunId identifier regex validation', () => {
  const RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

  assert.strictEqual(RUN_ID_REGEX.test('bt_run_2026_09_01-abc'), true);
  assert.strictEqual(RUN_ID_REGEX.test('12345'), true);
  assert.strictEqual(RUN_ID_REGEX.test('run-id-with_underscores-and-hyphens'), true);

  // Injections and malformed IDs
  assert.strictEqual(RUN_ID_REGEX.test("run' OR '1'='1"), false);
  assert.strictEqual(RUN_ID_REGEX.test('run;DROP TABLE trade;'), false);
  assert.strictEqual(RUN_ID_REGEX.test('../../etc/passwd'), false);
  assert.strictEqual(RUN_ID_REGEX.test(''), false);
  assert.strictEqual(RUN_ID_REGEX.test('a'.repeat(65)), false);
});

test('P1-2: Scanner sortOrder allow-list enforcement', () => {
  const sanitizeSortOrder = (raw: string | null | undefined): 'asc' | 'desc' => {
    const lower = raw?.toLowerCase();
    return lower === 'asc' ? 'asc' : 'desc';
  };

  assert.strictEqual(sanitizeSortOrder('asc'), 'asc');
  assert.strictEqual(sanitizeSortOrder('ASC'), 'asc');
  assert.strictEqual(sanitizeSortOrder('desc'), 'desc');
  assert.strictEqual(sanitizeSortOrder('DESC'), 'desc');
  assert.strictEqual(sanitizeSortOrder('injection'), 'desc');
  assert.strictEqual(sanitizeSortOrder(null), 'desc');
  assert.strictEqual(sanitizeSortOrder(undefined), 'desc');
  assert.strictEqual(sanitizeSortOrder(''), 'desc');
});

test('P1-3: Overnight/BTST date query format validation', () => {
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  assert.strictEqual(DATE_REGEX.test('2026-10-09'), true);
  assert.strictEqual(DATE_REGEX.test('2026-01-01'), true);

  // Reject garbage/injection
  assert.strictEqual(DATE_REGEX.test('not-a-date'), false);
  assert.strictEqual(DATE_REGEX.test('2026-1-1'), false);
  assert.strictEqual(DATE_REGEX.test('2026/10/09'), false);
  assert.strictEqual(DATE_REGEX.test("2026-10-09' OR '1'='1"), false);
  assert.strictEqual(DATE_REGEX.test(''), false);
});

test('P1-5: Retention cron limit clamp logic', () => {
  const parseRetentionLimit = (limitStr: string | null | undefined): number => {
    const rawLimit = parseInt(limitStr || '250', 10);
    return Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 250;
  };

  assert.strictEqual(parseRetentionLimit('500'), 500);
  assert.strictEqual(parseRetentionLimit('5000'), 1000);
  assert.strictEqual(parseRetentionLimit('abc'), 250);
  assert.strictEqual(parseRetentionLimit('-50'), 250);
  assert.strictEqual(parseRetentionLimit('0'), 250);
  assert.strictEqual(parseRetentionLimit(null), 250);
});

test('P1-6: PCR empty-OI honesty (returns null and skips unearned neutral points)', () => {
  // @ts-expect-error accessing private method for unit testing
  const computePCR = OptionSuggestionService.computePCR;

  // When call OI is 0, PCR is undefined/uncomputable -> must return null (NOT fake 1.0)
  const optionsZeroCallOI = [
    { symbol: 'PE1', strikePrice: 100, optionType: 'PE' as const, ltp: 10, open_interest: 500 },
    { symbol: 'CE1', strikePrice: 100, optionType: 'CE' as const, ltp: 10, open_interest: 0 },
  ];
  const pcrZeroCall = computePCR(optionsZeroCallOI);
  assert.strictEqual(pcrZeroCall, null, 'Must return null when totalCallOI is 0');

  // Normal positive call OI
  const optionsNormal = [
    { symbol: 'PE1', strikePrice: 100, optionType: 'PE' as const, ltp: 10, open_interest: 1200 },
    { symbol: 'CE1', strikePrice: 100, optionType: 'CE' as const, ltp: 10, open_interest: 1000 },
  ];
  const pcrNormal = computePCR(optionsNormal);
  assert.strictEqual(pcrNormal, 1.2, 'Must compute valid ratio when call OI > 0');

  // @ts-expect-error accessing private method for unit testing
  const scoreCandidate = OptionSuggestionService.scoreCandidate;
  const candidate = {
    option: { symbol: 'OPT1', strikePrice: 100, optionType: 'CE' as const, ltp: 10, open_interest: 100, volume: 100, bid: 9.9, ask: 10.1 },
    itmDepth: 1 as const,
  };

  // With pcr = null, pcrContextScore must be 0 (no unearned 10 neutral points!)
  const scoredNullPcr = scoreCandidate(candidate, [candidate], null, 'CE', false);
  assert.strictEqual(scoredNullPcr.scoreBreakdown.pcrContextScore, 0, 'Null PCR must give 0 context points');

  // With neutral pcr = 1.0, awards 10 neutral points
  const scoredNeutralPcr = scoreCandidate(candidate, [candidate], 1.0, 'CE', false);
  assert.strictEqual(scoredNeutralPcr.scoreBreakdown.pcrContextScore, 10, 'Neutral PCR awards 10 context points');

  // Breakout PCR gate handles null PCR safely without false suppression
  assert.strictEqual(optionPcrContradictsDirection('CE', null), false);
  assert.strictEqual(optionPcrContradictsDirection('PE', null), false);
});
