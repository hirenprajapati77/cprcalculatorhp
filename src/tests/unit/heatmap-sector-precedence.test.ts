import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeatmapSector } from '../../lib/heatmap-helpers';
import { getSymbolSector } from '../../services/market-tools/market-breadth.service';
import { canonicalizeSector } from '../../services/market-tools/nse-sector-map';

test('Sector Heatmap sector precedence (Fix 1)', async (t) => {
  await t.test('symbol with snapshot sector Other and known nse-sector-map sector resolves to mapped sector', () => {
    // E.g. AARTIIND is in CHEMICALS in NSE_SECTOR_MAP
    assert.strictEqual(getSymbolSector('AARTIIND'), 'CHEMICALS');
    const result = resolveHeatmapSector('AARTIIND', 'Other');
    assert.strictEqual(result, canonicalizeSector('CHEMICALS'));
    assert.notStrictEqual(result, 'Other');

    // SBIN is mapped to BANKING -> Financial Services
    assert.strictEqual(getSymbolSector('SBIN'), 'BANKING');
    const sbinResult = resolveHeatmapSector('SBIN', 'Other');
    assert.strictEqual(sbinResult, 'Financial Services');
    assert.notStrictEqual(sbinResult, 'Other');

    // TCS is mapped to IT
    assert.strictEqual(getSymbolSector('TCS'), 'IT');
    const tcsResult = resolveHeatmapSector('TCS', 'Other');
    assert.strictEqual(tcsResult, 'IT');
    assert.notStrictEqual(tcsResult, 'Other');
  });

  await t.test('falls back to snapshot sector when sector-map has no mapping or returns OTHERS', () => {
    // UNMAPPED_CO has no entry in NSE_SECTOR_MAP, getSymbolSector returns 'OTHERS'
    assert.strictEqual(getSymbolSector('UNMAPPED_CO_XYZ'), 'OTHERS');
    const result = resolveHeatmapSector('UNMAPPED_CO_XYZ', 'Automotive');
    assert.strictEqual(result, 'Automotive');
  });

  await t.test('resolves to Other when both sector-map and snapshot are unmapped or Other', () => {
    assert.strictEqual(getSymbolSector('UNMAPPED_CO_XYZ'), 'OTHERS');
    const resultOther = resolveHeatmapSector('UNMAPPED_CO_XYZ', 'Other');
    assert.strictEqual(resultOther, 'Other');

    const resultNull = resolveHeatmapSector('UNMAPPED_CO_XYZ', null);
    assert.strictEqual(resultNull, 'Other');
  });
});
