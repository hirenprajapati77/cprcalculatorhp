import test from 'node:test';
import assert from 'node:assert';
import { isLikelyEtfOrFund } from '../../lib/nse-fund-exclusion';

test('isLikelyEtfOrFund excludes known ETF/liquid-fund symbols seen live in scanner results', () => {
  const shouldExclude = [
    'GSEC10YEAR',
    'LIQUID1',
    'LIQUIDSHRI',
    'LIQUIDCASE',
    'LIQUIDADD',
    'LIQUIDBETF',
    'HDFCLIQUID',
    'MOM30IETF',
    'MIDCAPETF',
    'METALIETF',
    'MID150BEES',
    'MOM100',
    'MOMENTUM',
    'NEXT50',
    'AONETOTAL',
    'EQUAL200',
    'EQUAL50ADD',
    'GROWWLIQID',
    'GROWWDEFNC',
    'MIDCAPIETF',
    'MIDSMALL',
    'MIDSELIETF',
    'MIDCAPINDEX',
    'MIDSMALLCASE',
  ];
  for (const s of shouldExclude) {
    assert.strictEqual(isLikelyEtfOrFund(s), true, `expected ${s} to be excluded`);
  }
});

test('isLikelyEtfOrFund catches LIQUID as a substring, not just a prefix', () => {
  // HDFCLIQUID does not start with "LIQUID" -- an early version of the
  // regex anchored LIQUID to the start of the string (^LIQUID) and missed
  // this real symbol. Regression coverage for that specific gap.
  assert.strictEqual(isLikelyEtfOrFund('HDFCLIQUID'), true);
});

test('isLikelyEtfOrFund does not false-positive on a bare GROWW ticker', () => {
  // GROWWLIQID / GROWWDEFNC / GROWWMOM50 are Groww AMC's own ETF products.
  // An early version of the regex matched any symbol starting with "GROWW"
  // (^GROWW with no required trailing characters), which would have wrongly
  // excluded a hypothetical standalone "GROWW" stock ticker itself.
  assert.strictEqual(isLikelyEtfOrFund('GROWW'), false);
  assert.strictEqual(isLikelyEtfOrFund('GROWWMOM50'), true);
});

test('isLikelyEtfOrFund catches individually confirmed gap symbols', () => {
  // These slipped through the original regex -- confirmed live in a
  // Pattern Breakout screenshot, 29 Aug 2026 (Double Bottom tab). None of
  // them match any generalizable pattern without risking a false positive
  // on a real stock ticker, so they're an explicit allowlist rather than a
  // broadened regex. This test exists so future gap-closures land the same
  // way: confirm live, add to KNOWN_GAP_SYMBOLS, add a case here.
  const gaps = [
    'HDFCMOMENT',
    'MONQ50',
    'LICNMID100',
    'MULTICAP',
    'BBETF0432',
    'MASPTOP50',
    'MON100',
    'MOSMALL250',
    'MODEFENCE',
    'HDFCNEXT50',
    'LICNETFGSC',
    'HDFCQUAL',
    'MNC',
  ];
  for (const s of gaps) {
    assert.strictEqual(isLikelyEtfOrFund(s), true, `expected ${s} to be excluded`);
  }
  // Case-insensitivity check on the explicit set (the regex path is already
  // case-insensitive via the /i flag; the Set lookup needs its own check).
  assert.strictEqual(isLikelyEtfOrFund('hdfcmoment'), true);
});

test('isLikelyEtfOrFund does not exclude ordinary operating-company stock symbols', () => {
  const shouldKeep = [
    'ARIES',
    'QUESS',
    'IOLCP',
    'RGL',
    'ANTHEM',
    'JINDALSAW',
    'TVSSRICHAK',
    'DCBBANK',
    'JSWSTEEL',
    'RELIANCE',
    'TCS',
    'INFY',
    'AMBER',
    'NATIONALUM',
    'PNBGILTS',
    'JETFREIGHT',
    'MOREPENLAB',
    'MOIL',
    'MOTHERSON',
    'MOTILALOFS',
    'VALUEIND',
    'QUALITYINF',
    'DEFENCELTD',
    'MOMENTUMTECH',
    'LOWVOLIND',
    'MIDCAPCORP',
    'SMALLCAPCORP',
  ];
  for (const s of shouldKeep) {
    assert.strictEqual(isLikelyEtfOrFund(s), false, `expected ${s} NOT to be excluded`);
  }
});
