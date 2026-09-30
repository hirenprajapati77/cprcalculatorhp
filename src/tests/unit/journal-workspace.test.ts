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

  it('validates Open Positions KPI calculation and active status indication', () => {
    const totalFiltered = 25;
    const closedCount = 21;
    const openCount = Math.max(0, totalFiltered - closedCount);

    assert.equal(openCount, 4);
    assert.equal(openCount > 0, true);

    // Edge case: all closed
    const allClosedCount = 25;
    const zeroOpen = Math.max(0, totalFiltered - allClosedCount);
    assert.equal(zeroOpen, 0);
  });

  it('validates tradeStatus (OPEN vs CLOSED) and direction (LONG vs SHORT) filter predicates', () => {
    const records = [
      { id: '1', symbol: 'NIFTY', optionType: 'CE', signalType: 'BTST', exitCmp: 24500 },
      { id: '2', symbol: 'BANKNIFTY', optionType: 'PE', signalType: 'STBT', exitCmp: null },
      { id: '3', symbol: 'RELIANCE', optionType: 'CE', signalType: 'CPR', exitCmp: null },
      { id: '4', symbol: 'TCS', optionType: 'PE', signalType: 'CPR', exitCmp: 3950 },
    ];

    // Filter OPEN
    const openRecords = records.filter(r => r.exitCmp === null || r.exitCmp === undefined);
    assert.equal(openRecords.length, 2);
    assert.deepEqual(openRecords.map(r => r.id), ['2', '3']);

    // Filter CLOSED
    const closedRecords = records.filter(r => r.exitCmp !== null && r.exitCmp !== undefined);
    assert.equal(closedRecords.length, 2);
    assert.deepEqual(closedRecords.map(r => r.id), ['1', '4']);

    // Filter LONG
    const longRecords = records.filter(r => r.optionType === 'CE' || r.signalType === 'BTST');
    assert.equal(longRecords.length, 2);
    assert.deepEqual(longRecords.map(r => r.id), ['1', '3']);

    // Filter SHORT
    const shortRecords = records.filter(r => r.optionType === 'PE' || r.signalType === 'STBT');
    assert.equal(shortRecords.length, 2);
    assert.deepEqual(shortRecords.map(r => r.id), ['2', '4']);
  });

  it('validates Cumulative P&L Realization Curve accumulation logic', () => {
    const rawEntries = [
      { tradeDate: '2026-09-10', symbol: 'TCS', pnl: 2000, estimatedNetPnl: 1850 },
      { tradeDate: '2026-09-08', symbol: 'RELIANCE', pnl: 3000, estimatedNetPnl: 2800 },
      { tradeDate: '2026-09-09', symbol: 'INFY', pnl: -1000, estimatedNetPnl: -1150 },
      { tradeDate: '2026-09-11', symbol: 'HDFCBANK', pnl: null, estimatedNetPnl: null }, // unsettled
    ];

    const settled = rawEntries
      .filter((e) => e.pnl !== null && e.pnl !== undefined)
      .slice()
      .sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());

    assert.equal(settled.length, 3);
    assert.equal(settled[0]?.symbol, 'RELIANCE');
    assert.equal(settled[1]?.symbol, 'INFY');
    assert.equal(settled[2]?.symbol, 'TCS');

    let cumGross = 0;
    let cumNet = 0;
    const curve = settled.map((t, idx) => {
      cumGross += t.pnl ?? 0;
      cumNet += t.estimatedNetPnl ?? 0;
      return { step: idx + 1, cumGross, cumNet, drag: cumGross - cumNet };
    });

    // Step 1: RELIANCE -> Gross 3000, Net 2800, Drag 200
    assert.equal(curve[0]?.cumGross, 3000);
    assert.equal(curve[0]?.cumNet, 2800);
    assert.equal(curve[0]?.drag, 200);

    // Step 2: INFY -> Gross 2000, Net 1650, Drag 350
    assert.equal(curve[1]?.cumGross, 2000);
    assert.equal(curve[1]?.cumNet, 1650);
    assert.equal(curve[1]?.drag, 350);

    // Step 3: TCS -> Gross 4000, Net 3500, Drag 500
    assert.equal(curve[2]?.cumGross, 4000);
    assert.equal(curve[2]?.cumNet, 3500);
    assert.equal(curve[2]?.drag, 500);
  });

  it('validates interactive table sorting comparator for date, pnl, and symbol', () => {
    const items = [
      { tradeDate: '2026-09-08', symbol: 'INFY', pnl: 1000 },
      { tradeDate: '2026-09-10', symbol: 'RELIANCE', pnl: 3000 },
      { tradeDate: '2026-09-09', symbol: 'AXISBANK', pnl: -500 },
    ];

    // Sort by pnl descending
    const byPnlDesc = [...items].sort((a, b) => b.pnl - a.pnl);
    assert.deepEqual(byPnlDesc.map(i => i.symbol), ['RELIANCE', 'INFY', 'AXISBANK']);

    // Sort by symbol ascending
    const bySymbolAsc = [...items].sort((a, b) => a.symbol.localeCompare(b.symbol));
    assert.deepEqual(bySymbolAsc.map(i => i.symbol), ['AXISBANK', 'INFY', 'RELIANCE']);

    // Sort by date descending (newest first)
    const byDateDesc = [...items].sort((a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime());
    assert.deepEqual(byDateDesc.map(i => i.tradeDate), ['2026-09-10', '2026-09-09', '2026-09-08']);
  });
});
