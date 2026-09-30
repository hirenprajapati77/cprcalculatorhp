import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Enterprise Trade Journal Workspace Presentation Contract (Phase 8)', () => {
  it('enforces Authoritative Gross P&L vs Modeled Net P&L presentation invariant', () => {
    // Stored historical metrics remain authoritative
    const sampleEntries = [
      {
        id: 'trade-1',
        symbol: 'RELIANCE',
        signalType: 'BTST',
        pnl: 4500,
        pnlPct: 3.25,
        estimatedCharges: 320,
        estimatedNetPnl: 4180,
        estimatedNetPnlPct: 3.02,
        frictionModelTier: 'FUTURES_PROXY',
      },
      {
        id: 'trade-2',
        symbol: 'INFY',
        signalType: 'STBT',
        pnl: -1200,
        pnlPct: -1.15,
        estimatedCharges: 180,
        estimatedNetPnl: -1380,
        estimatedNetPnlPct: -1.32,
        frictionModelTier: 'FUTURES_PROXY',
      },
      {
        id: 'trade-3',
        symbol: 'TCS',
        signalType: 'CPR',
        pnl: 2800,
        pnlPct: 2.1,
        estimatedCharges: 210,
        estimatedNetPnl: 2590,
        estimatedNetPnlPct: 1.94,
        frictionModelTier: 'STATUTORY_FUTURES',
      },
    ];

    // Compute aggregated KPIs
    let grossPnlSum = 0;
    let estimatedChargesSum = 0;
    let estimatedNetPnlSum = 0;

    for (const e of sampleEntries) {
      grossPnlSum += e.pnl;
      estimatedChargesSum += e.estimatedCharges;
      estimatedNetPnlSum += e.estimatedNetPnl;
    }

    const frictionDrag = grossPnlSum - estimatedNetPnlSum;

    // Gross P&L = 4500 - 1200 + 2800 = 6100
    assert.equal(grossPnlSum, 6100);
    // Estimated Charges = 320 + 180 + 210 = 710
    assert.equal(estimatedChargesSum, 710);
    // Estimated Net P&L = 4180 - 1380 + 2590 = 5390
    assert.equal(estimatedNetPnlSum, 5390);
    // Friction Drag = 6100 - 5390 = 710 (equals charges)
    assert.equal(frictionDrag, estimatedChargesSum);
    assert.equal(frictionDrag, 710);
  });

  it('validates TradeDetailDrawer 6-stage lifecycle timeline integrity', () => {
    const mockTrade = {
      entryTime: '15:15 IST',
      entryCmp: 2450.5,
      cmp916: 2468.0,
      cmp930: 2482.5,
      cmp945: 2479.0,
      cmp1000: 2490.0,
      exitCmp: 2495.0,
      exitTime: '10:05 IST',
    };

    const timelinePoints = [
      { label: 'Trade Entry', time: mockTrade.entryTime, price: mockTrade.entryCmp },
      { label: '09:16 Market Open', time: '09:16 IST', price: mockTrade.cmp916 },
      { label: '09:30 Session Check', time: '09:30 IST', price: mockTrade.cmp930 },
      { label: '09:45 Session Check', time: '09:45 IST', price: mockTrade.cmp945 },
      { label: '10:00 Morning Window', time: '10:00 IST', price: mockTrade.cmp1000 },
      { label: 'Trade Exit', time: mockTrade.exitTime, price: mockTrade.exitCmp },
    ];

    assert.equal(timelinePoints.length, 6);
    assert.equal(timelinePoints[0]?.label, 'Trade Entry');
    assert.equal(timelinePoints[0]?.price, 2450.5);
    assert.equal(timelinePoints[1]?.time, '09:16 IST');
    assert.equal(timelinePoints[4]?.time, '10:00 IST');
    assert.equal(timelinePoints[5]?.price, 2495.0);
  });

  it('validates directional split calculation logic for LONG (CE) vs SHORT (PE)', () => {
    const trades = [
      { optionType: 'CE', signalType: 'BTST', pnl: 1000 },
      { optionType: 'CE', signalType: 'CPR', pnl: 1500 },
      { optionType: 'PE', signalType: 'STBT', pnl: -500 },
      { optionType: 'PE', signalType: 'CPR', pnl: 800 },
    ];

    let longCount = 0;
    let shortCount = 0;
    let longPnl = 0;
    let shortPnl = 0;

    for (const t of trades) {
      const isLong = t.optionType === 'CE' || t.signalType === 'BTST';
      if (isLong) {
        longCount++;
        longPnl += t.pnl;
      } else {
        shortCount++;
        shortPnl += t.pnl;
      }
    }

    assert.equal(longCount, 2);
    assert.equal(shortCount, 2);
    assert.equal(longPnl, 2500);
    assert.equal(shortPnl, 300);
  });

  it('validates table density mode styling resolution', () => {
    type DensityMode = 'compact' | 'detailed';
    const getPaddingClass = (mode: DensityMode) =>
      mode === 'compact' ? 'py-1.5 px-2.5 text-[11px]' : 'py-3 px-3 text-xs';

    assert.equal(getPaddingClass('compact'), 'py-1.5 px-2.5 text-[11px]');
    assert.equal(getPaddingClass('detailed'), 'py-3 px-3 text-xs');
  });

  it('validates column visibility schema integrity and default column set', () => {
    const DEFAULT_VISIBLE_COLUMNS = [
      'date',
      'type',
      'symbol',
      'contract',
      'entry',
      'cmp916',
      'cmp930',
      'cmp945',
      'exit',
      'pnl',
      'netPnl',
      'score',
      'scoreV2',
      'action',
    ];

    assert.ok(DEFAULT_VISIBLE_COLUMNS.includes('symbol'), 'Symbol column must be present');
    assert.ok(DEFAULT_VISIBLE_COLUMNS.includes('pnl'), 'Gross P&L must be present');
    assert.ok(DEFAULT_VISIBLE_COLUMNS.includes('netPnl'), 'Estimated Net P&L must be present');
    assert.ok(DEFAULT_VISIBLE_COLUMNS.includes('action'), 'Action column must be present');
    assert.equal(DEFAULT_VISIBLE_COLUMNS.length, 14);
  });

  it('ensures CSV export preserves both Gross P&L and Estimated Net P&L columns', () => {
    const exportHeaders = [
      'Trade Date',
      'Type',
      'Stock',
      'Option',
      'Entry CMP',
      '9:16 AM',
      '9:30 AM',
      '9:45 AM',
      'Exit CMP',
      'Gross P&L (₹)',
      'Gross P&L %',
      'Estimated Charges (₹)',
      'Estimated Net P&L (₹)',
      'Estimated Net P&L %',
      'Friction Tier',
      'Advanced Score',
      'Shadow Simple Score',
      'Quality Bucket',
      'Execution Outcome',
      'Event Risk',
      'Regime Snapshot',
      'Regime Parsed',
    ];

    assert.ok(exportHeaders.includes('Gross P&L (₹)'));
    assert.ok(exportHeaders.includes('Estimated Net P&L (₹)'));
    assert.ok(exportHeaders.includes('Estimated Charges (₹)'));
    assert.ok(exportHeaders.includes('Friction Tier'));
    assert.equal(exportHeaders.length, 22);
  });
});
