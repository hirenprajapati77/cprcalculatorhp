import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { isActionableScannerTopResult } from '../../lib/cpr-setup-staleness';
import { prisma } from '../../lib/db';
import { GET } from '../../app/api/scanner/top/route';

describe('isActionableScannerTopResult pure unit tests', () => {
  it('excludes setups with alertSuppressedReason GAP_INVALIDATED', () => {
    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: 'GAP_INVALIDATED',
        alertSuppressedDetail: 'entry 142 outside today range [145, 148]',
        signalSummary: 'BULLISH,BREAKOUT',
        entry: 142,
        ltp: 146,
        target: 155,
      }),
      false
    );
  });

  it('excludes setups with other alert suppression reasons (EXTENDED, AGAINST_PRIOR_CLOSE, VIX_ELEVATED)', () => {
    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: 'EXTENDED',
        signalSummary: 'BULLISH',
      }),
      false
    );

    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: 'AGAINST_PRIOR_CLOSE',
        signalSummary: 'BULLISH',
      }),
      false
    );

    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: 'VIX_ELEVATED',
        signalSummary: 'BULLISH',
      }),
      false
    );
  });

  it('excludes dead setups tagged with STALE_SETUP in signalSummary or signals list', () => {
    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: null,
        signalSummary: 'BULLISH,NARROW,STALE_SETUP',
      }),
      false
    );

    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: null,
        signals: ['BULLISH', 'STALE_SETUP'],
      }),
      false
    );
  });

  it('excludes setups where target has already been achieved', () => {
    // LONG target reached
    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: null,
        signalSummary: 'BULLISH,BREAKOUT',
        entry: 100,
        ltp: 110,
        target: 108,
        direction: 'LONG',
      }),
      false
    );

    // SHORT target reached
    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: null,
        signalSummary: 'BEARISH,BREAKDOWN',
        entry: 100,
        ltp: 90,
        target: 92,
        direction: 'SHORT',
      }),
      false
    );
  });

  it('approves clean actionable setups with tradeable levels', () => {
    assert.equal(
      isActionableScannerTopResult({
        alertSuppressedReason: null,
        signalSummary: 'BULLISH,NARROW,BREAKOUT',
        entry: 100,
        ltp: 102,
        target: 110,
        sl: 95,
        direction: 'LONG',
      }),
      true
    );
  });
});

describe('GET /api/scanner/top ranking & fall-through', () => {
  it('excludes GAP_INVALIDATED / dead setups and falls through to next highest actionable setups', async () => {
    const originalFindMany = prisma.scannerResult.findMany;
    const originalSnapshotFindMany = prisma.marketSnapshot.findMany;

    const mockResults = [
      {
        id: '1',
        symbol: 'GMRAIRPORT',
        date: '2026-10-08',
        score: 88,
        confidence: 60,
        signalSummary: 'BULLISH,STALE_SETUP',
        alertSuppressedReason: 'GAP_INVALIDATED',
        alertSuppressedDetail: 'entry 142 outside today range [145, 148]',
        entry: 142,
        ltp: 146,
        target: 155,
        sl: 138,
        bc: 140,
        tc: 142,
        pivot: 141,
        volume: 5000000,
        width: 0.8,
        classification: 'NARROW',
      },
      {
        id: '2',
        symbol: 'GODREJCP',
        date: '2026-10-08',
        score: 82,
        confidence: 70,
        signalSummary: 'BULLISH,NARROW,BREAKOUT',
        alertSuppressedReason: null,
        alertSuppressedDetail: null,
        entry: 1200,
        ltp: 1210,
        target: 1260,
        sl: 1170,
        bc: 1195,
        tc: 1205,
        pivot: 1200,
        volume: 1200000,
        width: 0.7,
        classification: 'NARROW',
      },
      {
        id: '3',
        symbol: 'TITAN',
        date: '2026-10-08',
        score: 77,
        confidence: 65,
        signalSummary: 'BULLISH,ABOVE_TC',
        alertSuppressedReason: null,
        alertSuppressedDetail: null,
        entry: 3200,
        ltp: 3225,
        target: 3320,
        sl: 3150,
        bc: 3190,
        tc: 3210,
        pivot: 3200,
        volume: 900000,
        width: 0.6,
        classification: 'NARROW',
      },
      {
        id: '4',
        symbol: 'DEADSTOCK',
        date: '2026-10-08',
        score: 74,
        confidence: 50,
        signalSummary: 'BULLISH,STALE_SETUP',
        alertSuppressedReason: null,
        alertSuppressedDetail: null,
        entry: 500,
        ltp: 505,
        target: 530,
        sl: 485,
        bc: 495,
        tc: 505,
        pivot: 500,
        volume: 300000,
        width: 1.0,
        classification: 'NORMAL',
      },
      {
        id: '5',
        symbol: 'METTARGET',
        date: '2026-10-08',
        score: 71,
        confidence: 60,
        signalSummary: 'BULLISH,TARGET_ACHIEVED',
        alertSuppressedReason: null,
        alertSuppressedDetail: null,
        entry: 800,
        ltp: 870,
        target: 860, // already exceeded target
        sl: 780,
        bc: 795,
        tc: 805,
        pivot: 800,
        volume: 800000,
        width: 0.9,
        classification: 'NORMAL',
      },
      {
        id: '6',
        symbol: 'OFSS',
        date: '2026-10-08',
        score: 68,
        confidence: 65,
        signalSummary: 'BULLISH,NARROW',
        alertSuppressedReason: null,
        alertSuppressedDetail: null,
        entry: 8000,
        ltp: 8050,
        target: 8300,
        sl: 7850,
        bc: 7980,
        tc: 8020,
        pivot: 8000,
        volume: 400000,
        width: 0.5,
        classification: 'NARROW',
      },
    ];

    prisma.scannerResult.findMany = (async (args: any) => {
      // Simulate database filtering: exclude alertSuppressedReason: not null, and STALE_SETUP
      let filtered = mockResults.filter((r) => {
        if (args?.where?.alertSuppressedReason === null && r.alertSuppressedReason !== null) {
          return false;
        }
        if (args?.where?.NOT?.signalSummary?.contains && r.signalSummary.includes(args.where.NOT.signalSummary.contains)) {
          return false;
        }
        return true;
      });

      if (args?.orderBy?.score === 'desc') {
        filtered = filtered.sort((a, b) => b.score - a.score);
      }
      if (args?.take) {
        filtered = filtered.slice(0, args.take);
      }
      return filtered;
    }) as any;

    prisma.marketSnapshot.findMany = (async () => [
      { symbol: 'GODREJCP', sector: 'FMCG', price: 1205 },
      { symbol: 'TITAN', sector: 'Consumer Durables', price: 3215 },
      { symbol: 'OFSS', sector: 'IT', price: 8020 },
    ]) as any;

    try {
      const req = new NextRequest('http://localhost:3000/api/scanner/top?limit=3&market=NSE');
      const response = await GET(req);
      assert.equal(response.status, 200);

      const data = await response.json();
      assert.equal(data.success, true);
      assert.equal(data.results.length, 3);

      // Verify that GMRAIRPORT (GAP_INVALIDATED), DEADSTOCK (STALE_SETUP), and METTARGET (target met) were excluded
      const symbols = data.results.map((r: { symbol: string }) => r.symbol);
      assert.deepEqual(symbols, ['GODREJCP', 'TITAN', 'OFSS']);
      assert.ok(!symbols.includes('GMRAIRPORT'), 'GMRAIRPORT must not appear in top algos');
      assert.ok(!symbols.includes('DEADSTOCK'), 'STALE_SETUP must not appear in top algos');
      assert.ok(!symbols.includes('METTARGET'), 'target-met setups must not appear in top algos');

      // Verify scores are descending
      assert.equal(data.results[0].score, 82);
      assert.equal(data.results[1].score, 77);
      assert.equal(data.results[2].score, 68);
    } finally {
      prisma.scannerResult.findMany = originalFindMany;
      prisma.marketSnapshot.findMany = originalSnapshotFindMany;
    }
  });
});
