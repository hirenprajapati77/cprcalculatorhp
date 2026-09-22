import test from 'node:test';
import assert from 'node:assert';
import { getSymbolSector } from '../../services/market-tools/market-breadth.service';
import { canonicalizeSector } from '../../services/market-tools/nse-sector-map';

test('getSymbolSector - sector classification and false-positive prevention', async (t) => {
  await t.test('prevents false-positive IT classifications for non-IT symbols containing IT substring', () => {
    assert.notStrictEqual(getSymbolSector('TITAN'), 'IT');
    assert.notStrictEqual(getSymbolSector('BRITANNIA'), 'IT');
  });

  await t.test('correctly classifies LTIM as IT (not INFRA)', () => {
    assert.strictEqual(getSymbolSector('LTIM'), 'IT');
  });

  await t.test('correctly classifies explicit bank symbols into BANKING sector', () => {
    assert.strictEqual(getSymbolSector('INDUSINDBK'), 'BANKING');
    assert.strictEqual(getSymbolSector('BANDHANBNK'), 'BANKING');
    assert.strictEqual(getSymbolSector('PNB'), 'BANKING');
    assert.strictEqual(getSymbolSector('CANBK'), 'BANKING');
    assert.strictEqual(getSymbolSector('DCBBANK'), 'BANKING');
    assert.strictEqual(getSymbolSector('AUBANK'), 'BANKING');
  });

  await t.test('correctly classifies newly mapped symbols from NSE master', () => {
    assert.strictEqual(getSymbolSector('ENTERO'), 'PHARMA');
    assert.strictEqual(getSymbolSector('MAXESTATES'), 'REALTY');
    assert.strictEqual(getSymbolSector('IDEA'), 'TELECOMMUNICATION');
  });

  await t.test('correctly classifies hyphenated symbols like BAJAJ-AUTO and series suffixes', () => {
    assert.strictEqual(getSymbolSector('BAJAJ-AUTO'), 'AUTO');
    assert.strictEqual(getSymbolSector('BAJAJ-AUTO-EQ'), 'AUTO');
    assert.strictEqual(getSymbolSector('TATASTEEL-EQ'), 'METALS');
  });
});

test('canonicalizeSector - sector normalization and alias resolution (HM-01)', async (t) => {
  await t.test('normalizes uppercase NSE sectors to platform canonical sectors', () => {
    assert.strictEqual(canonicalizeSector('AUTO'), 'Automotive');
    assert.strictEqual(canonicalizeSector('AUTOMOTIVE'), 'Automotive');
    assert.strictEqual(canonicalizeSector('BANKING'), 'Financial Services');
    assert.strictEqual(canonicalizeSector('FINANCIAL SERVICES'), 'Financial Services');
    assert.strictEqual(canonicalizeSector('PHARMA'), 'Healthcare');
    assert.strictEqual(canonicalizeSector('HEALTHCARE'), 'Healthcare');
    assert.strictEqual(canonicalizeSector('INFRA'), 'Construction');
    assert.strictEqual(canonicalizeSector('REALTY'), 'Construction');
    assert.strictEqual(canonicalizeSector('CONSTRUCTION'), 'Construction');
    assert.strictEqual(canonicalizeSector('METALS'), 'Metals');
    assert.strictEqual(canonicalizeSector('ENERGY'), 'Energy');
    assert.strictEqual(canonicalizeSector('CONSUMER GOODS'), 'Consumer Goods');
    assert.strictEqual(canonicalizeSector('TEXTILES'), 'Consumer Goods');
    assert.strictEqual(canonicalizeSector('TELECOM'), 'Telecom');
    assert.strictEqual(canonicalizeSector('TELECOMMUNICATION'), 'Telecom');
    assert.strictEqual(canonicalizeSector('SERVICES'), 'Services');
    assert.strictEqual(canonicalizeSector('CAPITAL GOODS'), 'Capital Goods');
    assert.strictEqual(canonicalizeSector('MATERIALS'), 'Materials');
    assert.strictEqual(canonicalizeSector('CHEMICALS'), 'Materials');
  });

  await t.test('preserves already-canonical title case sectors', () => {
    assert.strictEqual(canonicalizeSector('Financial Services'), 'Financial Services');
    assert.strictEqual(canonicalizeSector('IT'), 'IT');
    assert.strictEqual(canonicalizeSector('Automotive'), 'Automotive');
    assert.strictEqual(canonicalizeSector('Healthcare'), 'Healthcare');
    assert.strictEqual(canonicalizeSector('Construction'), 'Construction');
  });

  await t.test('handles null, undefined, empty, and unknown sectors safely', () => {
    assert.strictEqual(canonicalizeSector(null), 'Other');
    assert.strictEqual(canonicalizeSector(undefined), 'Other');
    assert.strictEqual(canonicalizeSector(''), 'Other');
    assert.strictEqual(canonicalizeSector('UNKNOWN_CUSTOM_SECTOR'), 'UNKNOWN_CUSTOM_SECTOR');
  });
});
