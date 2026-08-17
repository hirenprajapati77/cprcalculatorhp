import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBtstScannerConflict } from '../../lib/cpr-breakout-conflict';
import { EntryManagerService } from '../../services/overnight/entry-manager.service';
import type { MarketStockData } from '../../services/market.service';

describe('evaluateBtstScannerConflict', () => {
  it('returns not conflicted when signals array is null or empty', () => {
    assert.deepEqual(evaluateBtstScannerConflict('LONG', null), { conflicted: false });
    assert.deepEqual(evaluateBtstScannerConflict('LONG', []), { conflicted: false });
    assert.deepEqual(evaluateBtstScannerConflict('SHORT', null), { conflicted: false });
    assert.deepEqual(evaluateBtstScannerConflict('SHORT', []), { conflicted: false });
  });

  it('rejects BTST LONG when scanner confirms BREAKDOWN', () => {
    const res = evaluateBtstScannerConflict('LONG', ['BEARISH', 'BREAKDOWN', 'NARROW']);
    assert.equal(res.conflicted, true);
    assert.equal(res.reason, 'SCANNER_BREAKDOWN_CONFLICT');
  });

  it('does NOT reject BTST LONG on neutral or aligned signals', () => {
    const res = evaluateBtstScannerConflict('LONG', ['BULLISH', 'BREAKOUT', 'NARROW']);
    assert.equal(res.conflicted, false);

    // Merely BEARISH tag without confirmed BREAKDOWN does not hard block
    const res2 = evaluateBtstScannerConflict('LONG', ['BEARISH', 'NARROW']);
    assert.equal(res2.conflicted, false);
  });

  it('rejects STBT SHORT when scanner confirms BREAKOUT', () => {
    const res = evaluateBtstScannerConflict('SHORT', ['BULLISH', 'BREAKOUT', 'NARROW']);
    assert.equal(res.conflicted, true);
    assert.equal(res.reason, 'SCANNER_BREAKOUT_CONFLICT');
  });

  it('does NOT reject STBT SHORT on neutral or aligned signals', () => {
    const res = evaluateBtstScannerConflict('SHORT', ['BEARISH', 'BREAKDOWN', 'NARROW']);
    assert.equal(res.conflicted, false);

    // Merely BULLISH tag without confirmed BREAKOUT does not hard block
    const res2 = evaluateBtstScannerConflict('SHORT', ['BULLISH', 'NARROW']);
    assert.equal(res2.conflicted, false);
  });
});

describe('EntryManagerService.evaluateBreakoutConflict', () => {
  const dummyStock: MarketStockData = {
    symbol: 'LICHSGFIN',
    market: 'NSE',
    sector: 'FINANCIAL SERVICES',
    open: 500,
    high: 502,
    low: 495,
    close: 499,
    ltp: 499.55,
    volume: 500000,
    avgVolume: 200000,
    marketCap: 25000,
  };

  it('returns eligible: false when BTST LONG encounters intraday BREAKDOWN', () => {
    const res = EntryManagerService.evaluateBreakoutConflict(dummyStock, 'LONG', ['BREAKDOWN', 'BEARISH']);
    assert.equal(res.eligible, false);
    assert.equal(res.reason, 'SCANNER_BREAKDOWN_CONFLICT');
  });

  it('returns eligible: true when BTST LONG has no opposite BREAKDOWN', () => {
    const res = EntryManagerService.evaluateBreakoutConflict(dummyStock, 'LONG', ['BULLISH']);
    assert.equal(res.eligible, true);
    assert.equal(res.reason, null);
  });
});
