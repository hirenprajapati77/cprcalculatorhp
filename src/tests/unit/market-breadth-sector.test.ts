import test from 'node:test';
import assert from 'node:assert';
import { getSymbolSector } from '../../services/market-tools/market-breadth.service';

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
  });
});
