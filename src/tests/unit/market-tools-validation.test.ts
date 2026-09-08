import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as breakoutGet } from '../../app/api/market-tools/breakout/route';
import { GET as patternBreakoutGet } from '../../app/api/market-tools/pattern-breakout/route';
import { GET as momentumLeadersGet } from '../../app/api/market-tools/momentum-leaders/route';
import { MultiYearBreakoutService } from '../../services/market-tools/multi-year-breakout.service';
import { PatternBreakoutService } from '../../services/market-tools/pattern-breakout.service';
import { MomentumLeadersService } from '../../services/market-tools/momentum-leaders.service';

function createRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: { host: 'localhost:3000' },
  });
}

describe('Market-Tools API Query Parameter Validation', () => {
  describe('GET /api/market-tools/breakout', () => {
    it('returns 400 when invalid window is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/breakout?window=99Y');
      const res = await breakoutGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, 'Invalid query parameters');
      assert.ok(Array.isArray(json.details));
      assert.ok(json.details.some((d: any) => d.field === 'window'));
    });

    it('returns 400 when invalid refresh is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/breakout?refresh=invalid');
      const res = await breakoutGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'refresh'));
    });

    it('returns 401 when refresh=true without auth', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/breakout?refresh=true');
      const res = await breakoutGet(req);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error, 'Unauthorized');
    });

    it('accepts valid window filters and defaults missing window to ALL', async () => {
      const orig = MultiYearBreakoutService.getBreakoutReport;
      (MultiYearBreakoutService as any).getBreakoutReport = async () => ({
        date: '2026-09-07',
        tradingDaysAvailable: 250,
        totalScanned: 1,
        qualifiedCount: 1,
        windowCounts: { '1Y': 1, '2Y': 0, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 0 },
        breakoutCounts: { '1Y': 1, '2Y': 0, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 0 },
        windowAvailability: { '1Y': true, '2Y': true, '3Y': true, '5Y': true, '10Y': true, ATH: true },
        stocks: [
          {
            symbol: 'TEST',
            sector: 'IT',
            close: 100,
            prevClose: 99,
            changePct: 1,
            volume: 1000,
            rvol20d: null,
            clv: null,
            historyDays: 250,
            breakout1Y: true,
            high1Y: 99,
            gain1YPct: 1,
            breakout2Y: null,
            high2Y: null,
            gain2YPct: null,
            breakout3Y: null,
            high3Y: null,
            gain3YPct: null,
            breakout5Y: null,
            high5Y: null,
            gain5YPct: null,
            breakout10Y: null,
            high10Y: null,
            gain10YPct: null,
            breakoutATH: null,
            highATH: null,
            gainATHPct: null,
            vpaFootprint: 'NEUTRAL' as any,
          },
        ],
        computedAt: new Date().toISOString(),
      });

      try {
        const reqValid = createRequest('http://localhost:3000/api/market-tools/breakout?window=1Y');
        const resValid = await breakoutGet(reqValid);
        assert.strictEqual(resValid.status, 200);
        const jsonValid = await resValid.json();
        assert.strictEqual(jsonValid.success, true);
        assert.strictEqual(jsonValid.data.stocks.length, 1);

        const reqDefault = createRequest('http://localhost:3000/api/market-tools/breakout');
        const resDefault = await breakoutGet(reqDefault);
        assert.strictEqual(resDefault.status, 200);
        const jsonDefault = await resDefault.json();
        assert.strictEqual(jsonDefault.success, true);
        assert.strictEqual(jsonDefault.data.stocks.length, 1);
      } finally {
        MultiYearBreakoutService.getBreakoutReport = orig;
      }
    });
  });

  describe('GET /api/market-tools/pattern-breakout', () => {
    it('returns 400 when invalid pattern is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?pattern=INVALID_PATTERN');
      const res = await patternBreakoutGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'pattern'));
    });

    it('returns 400 when invalid status is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?status=PENDING');
      const res = await patternBreakoutGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'status'));
    });

    it('returns 400 when invalid tier is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?tier=Z');
      const res = await patternBreakoutGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'tier'));
    });

    it('accepts valid pattern, status, tier (including unencoded A+ and encoded A%2B)', async () => {
      const orig = PatternBreakoutService.getPatternBreakoutReport;
      (PatternBreakoutService as any).getPatternBreakoutReport = async () => ({
        date: '2026-09-07',
        tradingDaysAvailable: 250,
        totalScanned: 2,
        qualifiedCount: 2,
        countsByStatus: { BREAKOUT: 2, NEAR_HIGH: 0 },
        countsByPattern: { FLAG_POLE: 0, VCP: 2, CUP_AND_HANDLE: 0, DOUBLE_BOTTOM: 0, FLAT_BASE: 0, NONE: 0 },
        countsByTier: { 'A+': 1, A: 1, B: 0, C: 0 },
        stocks: [
          {
            symbol: 'STOCK_APLUS',
            sector: 'IT',
            close: 100,
            prevClose: 99,
            changePct: 1,
            volume: 1000,
            rvol20d: null,
            clv: null,
            historyDays: 250,
            high52w: 105,
            distanceToHighPct: 5,
            status: 'BREAKOUT',
            primaryPattern: 'VCP',
            primaryPatternLabel: 'Volatility Contraction',
            detectedPatterns: [],
            scoreBreakdown: {
              proximityScore: 25,
              volumeScore: 20,
              patternScore: 20,
              momentumScore: 15,
              vpaModifier: 0,
              totalScore: 80,
              qualityTier: 'A+',
            },
            patternDetails: null,
            vpaFootprint: 'NEUTRAL' as any,
          },
          {
            symbol: 'STOCK_A',
            sector: 'AUTO',
            close: 200,
            prevClose: 198,
            changePct: 1,
            volume: 1000,
            rvol20d: null,
            clv: null,
            historyDays: 250,
            high52w: 210,
            distanceToHighPct: 5,
            status: 'BREAKOUT',
            primaryPattern: 'VCP',
            primaryPatternLabel: 'Volatility Contraction',
            detectedPatterns: [],
            scoreBreakdown: {
              proximityScore: 20,
              volumeScore: 18,
              patternScore: 18,
              momentumScore: 14,
              vpaModifier: 0,
              totalScore: 70,
              qualityTier: 'A',
            },
            patternDetails: null,
            vpaFootprint: 'NEUTRAL' as any,
          },
        ],
        computedAt: new Date().toISOString(),
      });

      try {
        // Test encoded A%2B
        const reqEncoded = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?pattern=VCP&status=BREAKOUT&tier=A%2B');
        const resEncoded = await patternBreakoutGet(reqEncoded);
        assert.strictEqual(resEncoded.status, 200);
        const jsonEncoded = await resEncoded.json();
        assert.strictEqual(jsonEncoded.success, true);
        assert.strictEqual(jsonEncoded.data.stocks.length, 1);
        assert.strictEqual(jsonEncoded.data.stocks[0].symbol, 'STOCK_APLUS');
        assert.strictEqual(jsonEncoded.data.stocks[0].scoreBreakdown.qualityTier, 'A+');

        // Test unencoded A+ (which URL decodes as 'A ')
        const reqUnencoded = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?tier=A+');
        const resUnencoded = await patternBreakoutGet(reqUnencoded);
        assert.strictEqual(resUnencoded.status, 200);
        const jsonUnencoded = await resUnencoded.json();
        assert.strictEqual(jsonUnencoded.success, true);
        assert.strictEqual(jsonUnencoded.data.stocks.length, 1);
        assert.strictEqual(jsonUnencoded.data.stocks[0].symbol, 'STOCK_APLUS');
        assert.strictEqual(jsonUnencoded.data.stocks[0].scoreBreakdown.qualityTier, 'A+');

        // Test explicit tier A
        const reqA = createRequest('http://localhost:3000/api/market-tools/pattern-breakout?tier=A');
        const resA = await patternBreakoutGet(reqA);
        assert.strictEqual(resA.status, 200);
        const jsonA = await resA.json();
        assert.strictEqual(jsonA.success, true);
        assert.strictEqual(jsonA.data.stocks.length, 1);
        assert.strictEqual(jsonA.data.stocks[0].symbol, 'STOCK_A');
        assert.strictEqual(jsonA.data.stocks[0].scoreBreakdown.qualityTier, 'A');
      } finally {
        PatternBreakoutService.getPatternBreakoutReport = orig;
      }
    });
  });

  describe('GET /api/market-tools/momentum-leaders', () => {
    it('returns 400 when invalid universe is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?universe=MIDCAP');
      const res = await momentumLeadersGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'universe'));
    });

    it('returns 400 when invalid windows filter is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?windows=9');
      const res = await momentumLeadersGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'windows'));
    });

    it('returns 400 when invalid tier is provided', async () => {
      const req = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?tier=S_TIER');
      const res = await momentumLeadersGet(req);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.details.some((d: any) => d.field === 'tier'));
    });

    it('accepts valid query parameters and filters correctly (including unencoded A+ and encoded A%2B)', async () => {
      const orig = MomentumLeadersService.getMomentumLeadersReport;
      (MomentumLeadersService as any).getMomentumLeadersReport = async () => ({
        date: '2026-09-07',
        universe: 'NSE_FNO',
        totalScanned: 2,
        qualifiedCount: 2,
        countsByTier: { 'A+': 1, A: 1, B: 0, C: 0 },
        countsByWindows: { '4': 2, '3': 0, '2': 0, '1': 0 },
        countsByLeaderWindows: { '4': 2, '3': 0, '2': 0, '1': 0 },
        leaders4of4: [],
        topLeaders: [],
        allStocks: [
          {
            symbol: 'LEADER_APLUS',
            sector: 'IT',
            close: 100,
            prevClose: 99,
            changePct: 1,
            volume: 1000,
            turnoverCr: 50,
            avgTurnoverCr20d: 45,
            rvol20d: null,
            clv: null,
            vpaFootprint: 'NEUTRAL' as any,
            windows: {
              w1d: { returnPct: 1, rank: 1, percentile: 90, isLeader: true },
              w5d: { returnPct: 2, rank: 1, percentile: 90, isLeader: true },
              w10d: { returnPct: 3, rank: 1, percentile: 90, isLeader: true },
              w21d: { returnPct: 4, rank: 1, percentile: 90, isLeader: true },
            },
            leaderWindowCount: 4,
            baseScore: 50,
            consistencyBonus: 20,
            dispersionPenalty: 0,
            vpaModifier: 0,
            compositeScore: 70,
            tier: 'A+',
            isCircuitLocked: false,
            circuitLimitPct: null,
          },
          {
            symbol: 'LEADER_A',
            sector: 'IT',
            close: 200,
            prevClose: 198,
            changePct: 1,
            volume: 1000,
            turnoverCr: 50,
            avgTurnoverCr20d: 45,
            rvol20d: null,
            clv: null,
            vpaFootprint: 'NEUTRAL' as any,
            windows: {
              w1d: { returnPct: 1, rank: 1, percentile: 80, isLeader: true },
              w5d: { returnPct: 2, rank: 1, percentile: 80, isLeader: true },
              w10d: { returnPct: 3, rank: 1, percentile: 80, isLeader: true },
              w21d: { returnPct: 4, rank: 1, percentile: 80, isLeader: true },
            },
            leaderWindowCount: 4,
            baseScore: 40,
            consistencyBonus: 15,
            dispersionPenalty: 0,
            vpaModifier: 0,
            compositeScore: 55,
            tier: 'A',
            isCircuitLocked: false,
            circuitLimitPct: null,
          },
        ],
        computedAt: new Date().toISOString(),
        status: 'ready',
      });

      try {
        // Test unencoded A+ (which URL decodes as 'A ')
        const reqUnencoded = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?universe=NSE_FNO&tier=A+&windows=4&sector=IT');
        const resUnencoded = await momentumLeadersGet(reqUnencoded);
        assert.strictEqual(resUnencoded.status, 200);
        const jsonUnencoded = await resUnencoded.json();
        assert.strictEqual(jsonUnencoded.success, true);
        assert.strictEqual(jsonUnencoded.data.allStocks.length, 1);
        assert.strictEqual(jsonUnencoded.data.allStocks[0].symbol, 'LEADER_APLUS');
        assert.strictEqual(jsonUnencoded.data.allStocks[0].tier, 'A+');

        // Test encoded A%2B
        const reqEncoded = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?universe=NSE_FNO&tier=A%2B&windows=4&sector=IT');
        const resEncoded = await momentumLeadersGet(reqEncoded);
        assert.strictEqual(resEncoded.status, 200);
        const jsonEncoded = await resEncoded.json();
        assert.strictEqual(jsonEncoded.success, true);
        assert.strictEqual(jsonEncoded.data.allStocks.length, 1);
        assert.strictEqual(jsonEncoded.data.allStocks[0].symbol, 'LEADER_APLUS');
        assert.strictEqual(jsonEncoded.data.allStocks[0].tier, 'A+');

        // Test explicit A tier
        const reqA = createRequest('http://localhost:3000/api/market-tools/momentum-leaders?universe=NSE_FNO&tier=A');
        const resA = await momentumLeadersGet(reqA);
        assert.strictEqual(resA.status, 200);
        const jsonA = await resA.json();
        assert.strictEqual(jsonA.success, true);
        assert.strictEqual(jsonA.data.allStocks.length, 1);
        assert.strictEqual(jsonA.data.allStocks[0].symbol, 'LEADER_A');
        assert.strictEqual(jsonA.data.allStocks[0].tier, 'A');
      } finally {
        MomentumLeadersService.getMomentumLeadersReport = orig;
      }
    });
  });
});
