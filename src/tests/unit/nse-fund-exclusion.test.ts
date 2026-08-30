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
  ];
  for (const s of shouldKeep) {
    assert.strictEqual(isLikelyEtfOrFund(s), false, `expected ${s} NOT to be excluded`);
  }
});
