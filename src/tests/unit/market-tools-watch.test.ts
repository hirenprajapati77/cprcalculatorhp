import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MarketToolsWatchService, type WatchCandidate } from '@/services/alert/market-tools-watch.service';
import { MultiYearBreakoutService, type MultiYearBreakoutReport } from '@/services/market-tools/multi-year-breakout.service';
import { PatternBreakoutService, type PatternBreakoutReport } from '@/services/market-tools/pattern-breakout.service';
import { MomentumLeadersService, type MomentumLeadersReport } from '@/services/market-tools/momentum-leaders.service';
import { TelegramService } from '@/services/alert/telegram.service';
import { getNextNseTradingDay } from '@/lib/market-hours';
import type { BreakoutVpaFootprint } from '@/services/vpa/vpa.math';
import { GET as marketToolsWatchRoute } from '@/app/api/cron/market-tools-watch/route';
import { env } from '@/config/env';
import { resetCronRunClaims, tryClaimCronRun, completeCronRun } from '@/services/scheduler/cron-run-claim';
import {
  shouldCompleteClaimedJob,
  isMarketToolsPrecomputeWindowOpen,
  isMarketToolsWatchWindowOpen,
  runMarketToolsWatchJob,
} from '@/services/scheduler/market-cron.scheduler';

describe('Market Tools Telegram WATCH Pipeline (Phase 1)', () => {
  const scanDate = '2026-10-14'; // Wednesday
  const expectedNextSession = '2026-10-15'; // Thursday

  const mockVpaFootprint: BreakoutVpaFootprint = {
    status: 'CONFIRMED',
    clv: 0.85,
    rvol: 2.1,
    label: 'Volume Confirmed',
    badgeVariant: 'success',
    description: 'Volume-backed breakout',
    scoreModifier: 5,
  };

  // Sample Mock Reports
  const mockMultiYearReport: MultiYearBreakoutReport = {
    date: scanDate,
    tradingDaysAvailable: 500,
    totalScanned: 2000,
    breakoutCounts: { '1Y': 1, '2Y': 1, '3Y': 0, '5Y': 0, '10Y': 0, ATH: 1 },
    windowAvailability: {
      '1Y': { available: true, requiredDays: 250, availableDays: 500, label: 'Available' },
      '2Y': { available: true, requiredDays: 500, availableDays: 500, label: 'Available' },
      '3Y': { available: false, requiredDays: 750, availableDays: 500, label: 'Insufficient' },
      '5Y': { available: false, requiredDays: 1250, availableDays: 500, label: 'Insufficient' },
      '10Y': { available: false, requiredDays: 2500, availableDays: 500, label: 'Insufficient' },
      ATH: { available: true, requiredDays: 500, availableDays: 500, label: 'Available' },
    },
    stocks: [
      {
        symbol: 'TRENT',
        sector: 'Retail',
        close: 7820,
        prevClose: 7700,
        changePct: 1.56,
        volume: 1200000,
        rvol20d: 2.1,
        clv: 0.85,
        historyDays: 500,
        breakout1Y: true,
        high1Y: 7500,
        gain1YPct: 4.27,
        breakout2Y: true,
        high2Y: 7600,
        gain2YPct: 2.89,
        breakout3Y: null,
        high3Y: null,
        gain3YPct: null,
        breakout5Y: null,
        high5Y: null,
        gain5YPct: null,
        breakout10Y: null,
        high10Y: null,
        gain10YPct: null,
        breakoutATH: true,
        highATH: 7750,
        gainATHPct: 0.9,
        strongestBreakout: 'ATH',
        breakoutPrice: 7750,
        breakoutGainPct: 0.9,
        vpaFootprint: mockVpaFootprint,
      },
    ],
    computedAt: '2026-10-14T19:16:00.000Z',
    status: 'ready',
    freshness: 'FRESH',
  };

  const mockPatternReport: PatternBreakoutReport = {
    date: scanDate,
    tradingDaysAvailable: 300,
    totalScanned: 2000,
    qualifiedCount: 1,
    countsByStatus: { BREAKOUT: 1, NEAR_HIGH: 0 },
    countsByPattern: { FLAG_POLE: 0, VCP: 0, CUP_AND_HANDLE: 1, DOUBLE_BOTTOM: 0, FLAT_BASE: 0, NONE: 0 },
    countsByTier: { 'A+': 1, A: 0, B: 0, C: 0 },
    stocks: [
      {
        symbol: 'DIXON',
        sector: 'Consumer Durables',
        close: 15250,
        prevClose: 15000,
        changePct: 1.67,
        volume: 450000,
        rvol20d: 1.8,
        clv: 0.72,
        historyDays: 300,
        high52w: 15200,
        distanceToHighPct: 0.33,
        status: 'BREAKOUT',
        primaryPattern: 'CUP_AND_HANDLE',
        primaryPatternLabel: 'Cup & Handle',
        detectedPatterns: [
          {
            type: 'CUP_AND_HANDLE',
            label: 'Cup & Handle',
            baseDepthPct: 18.5,
            baseDays: 45,
            confidence: 88,
            description: 'Rounded cup with tight handle',
          },
        ],
        scoreBreakdown: {
          proximityScore: 30,
          volumeScore: 22,
          patternScore: 24,
          momentumScore: 18,
          vpaModifier: 4,
          totalScore: 98,
          qualityTier: 'A+',
        },
        patternDetails: {
          type: 'CUP_AND_HANDLE',
          label: 'Cup & Handle',
          baseDepthPct: 18.5,
          baseDays: 45,
          confidence: 88,
          description: 'Rounded cup with tight handle',
        },
        vpaFootprint: mockVpaFootprint,
      },
    ],
    computedAt: '2026-10-14T19:17:00.000Z',
    status: 'ready',
    freshness: 'FRESH',
  };

  const mockMomentumReport: MomentumLeadersReport = {
    date: scanDate,
    universe: 'ALL_NSE',
    totalScanned: 2000,
    qualifiedCount: 1,
    countsByTier: { 'A+': 1, A: 0, B: 0, C: 0 },
    countsByLeaderWindows: {
      '4_windows': 1,
      '3_windows': 0,
      '2_windows': 0,
      '1_window': 0,
      '0_windows': 0,
    },
    topLeaders: [
      {
        symbol: 'BHARTIARTL',
        sector: 'Telecom',
        close: 1715,
        prevClose: 1690,
        changePct: 1.48,
        volume: 3500000,
        turnoverCr: 600.25,
        avgTurnoverCr20d: 450.5,
        rvol20d: 1.4,
        clv: 0.65,
        vpaFootprint: mockVpaFootprint,
        windows: {
          w1d: { returnPct: 1.48, rank: 12, percentile: 94.5, isLeader: true },
          w5d: { returnPct: 4.85, rank: 8, percentile: 96.2, isLeader: true },
          w10d: { returnPct: 9.2, rank: 15, percentile: 93.1, isLeader: true },
          w21d: { returnPct: 16.5, rank: 10, percentile: 95.8, isLeader: true },
        },
        leaderWindowCount: 4,
        baseScore: 95,
        consistencyBonus: 5,
        dispersionPenalty: 0,
        vpaModifier: 2,
        compositeScore: 100,
        tier: 'A+',
        isCircuitLocked: false,
        circuitLimitPct: null,
      },
    ],
    allStocks: [],
    computedAt: '2026-10-14T19:18:00.000Z',
    status: 'ready',
    freshness: 'FRESH',
  };

  beforeEach(() => {
    // Restore default mocks
    MultiYearBreakoutService.getBreakoutReport = async () => mockMultiYearReport;
    PatternBreakoutService.getPatternBreakoutReport = async () => mockPatternReport;
    MomentumLeadersService.getMomentumLeadersReport = async () => mockMomentumReport;
  });

  describe('1. Precompute Readiness & Freshness Verification', () => {
    it('assembles report successfully when all 3 modules are ready and fresh', async () => {
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'), // 19:30 IST
      });

      assert.equal(res.ready, true);
      assert.equal(res.scanDate, scanDate);
      assert.equal(res.nextSessionDate, expectedNextSession);
      assert.equal(res.candidateCount, 3);
      assert.ok(res.message?.includes('CPR PRO — MARKET TOOLS WATCHLIST'));
      assert.ok(res.message?.includes('TRENT'));
      assert.ok(res.message?.includes('DIXON'));
      assert.ok(res.message?.includes('BHARTIARTL'));
    });

    it('suppresses report when any module is in pending state (cold cache)', async () => {
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        status: 'pending',
      });

      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.equal(res.ready, false);
      assert.ok(res.reason?.includes('precompute_not_ready'));
      assert.ok(res.reason?.includes('MultiYear'));
    });

    it('suppresses report when any module is stale', async () => {
      PatternBreakoutService.getPatternBreakoutReport = async () => ({
        ...mockPatternReport,
        freshness: 'STALE',
      });

      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.equal(res.ready, false);
      assert.ok(res.reason?.includes('precompute_not_ready'));
      assert.ok(res.reason?.includes('Pattern'));
    });

    it('suppresses report when cached date does not match current scan date', async () => {
      MomentumLeadersService.getMomentumLeadersReport = async () => ({
        ...mockMomentumReport,
        date: '2026-10-13', // Yesterday's cached report
      });

      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.equal(res.ready, false);
      assert.ok(res.reason?.includes('precompute_not_ready'));
      assert.ok(res.reason?.includes('Momentum'));
    });

    it('delayed precompute: returns precompute_not_ready during delay and succeeds once finished', async () => {
      // Step 1: Delayed precompute in progress (status: 'pending')
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        status: 'pending',
      });

      const step1 = await MarketToolsWatchService.dispatchWatchAlerts({ dryRun: true, forceDate: scanDate });
      assert.equal(step1.success, false);
      assert.equal(step1.sent, false);
      assert.ok(step1.reason?.includes('precompute_not_ready'));

      // Step 2: Precompute completes (status: 'ready')
      MultiYearBreakoutService.getBreakoutReport = async () => mockMultiYearReport;
      const step2 = await MarketToolsWatchService.dispatchWatchAlerts({ dryRun: true, forceDate: scanDate });
      assert.equal(step2.success, true);
      assert.equal(step2.dryRun, true);
      assert.equal(step2.candidateCount, 3);
    });
  });

  describe('2. Trading Day & Calendar Correctness', () => {
    it('correctly calculates next trading day skipping weekend', () => {
      // Friday Oct 16, 2026 -> Next trading day is Monday Oct 19, 2026
      const friday = new Date('2026-10-16T15:00:00.000Z');
      const nextDay = getNextNseTradingDay(friday);
      assert.equal(nextDay, '2026-10-19');
    });

    it('correctly calculates next trading day skipping official NSE holiday (Dussehra Oct 20, 2026)', () => {
      // Monday Oct 19, 2026 -> Next trading day skips Dussehra (Tuesday Oct 20) -> Wednesday Oct 21
      const monday = new Date('2026-10-19T15:00:00.000Z');
      const nextDay = getNextNseTradingDay(monday);
      assert.equal(nextDay, '2026-10-21');
    });

    it('correctly skips Gandhi Jayanti holiday (Friday Oct 2, 2026) bridging to Monday Oct 5', () => {
      // Thursday Oct 1, 2026 -> Next trading day skips Gandhi Jayanti (Friday Oct 2) and weekend -> Monday Oct 5
      const thursday = '2026-10-01';
      const nextDay = getNextNseTradingDay(thursday);
      assert.equal(nextDay, '2026-10-05');
    });

    it('suppresses report when reference date is not an NSE trading day', async () => {
      // Sunday Oct 18, 2026 (14:00 UTC = 19:30 IST on Sunday Oct 18)
      const sunday = new Date('2026-10-18T14:00:00.000Z');
      const res = await MarketToolsWatchService.assembleWatchReport({
        now: sunday,
      });

      assert.equal(res.ready, false);
      assert.equal(res.reason, 'not_a_trading_day');
    });
  });

  describe('3. Structural Pivot vs PDH & Honest Labeling', () => {
    it('labels Multi-Year structural pivot explicitly without confusing with PDH', async () => {
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      const trent = res.candidates?.find((c: WatchCandidate) => c.symbol === 'TRENT');
      assert.ok(trent);
      assert.equal(trent.structuralPivot, 7750);
      assert.equal(trent.structuralPivotLabel, 'ATH High');
      assert.equal(trent.previousClose, 7820);
      // Confirms message text contains structural pivot label
      assert.ok(res.message?.includes('Pivot: <b>₹7750.00</b> (ATH High)'));
    });

    it('labels 52W Pattern pivot honestly as Reference: 52W High without fabricating pattern pivot', async () => {
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      const dixon = res.candidates?.find((c: WatchCandidate) => c.symbol === 'DIXON');
      assert.ok(dixon);
      assert.equal(dixon.structuralPivot, 15200);
      assert.equal(dixon.structuralPivotLabel, 'Reference: 52W High');
      assert.equal(dixon.setupDetail, 'Cup & Handle (Tier A+, Score: 98) (Depth: 18.5%, 45d base)');
      assert.ok(res.message?.includes('Reference: <b>₹15200.00</b> (52W High)'));
      assert.ok(res.message?.includes('Status: <i>Pattern candidate — structural pattern pivot pending confirmation</i>'));
      assert.ok(!res.message?.includes('52W High / Pattern Pivot'));
    });

    it('labels Momentum Leaders as Reference: Previous Close, not a structural pivot', async () => {
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      const bharti = res.candidates?.find((c: WatchCandidate) => c.symbol === 'BHARTIARTL');
      assert.ok(bharti);
      assert.equal(bharti.structuralPivot, null);
      assert.equal(bharti.structuralPivotLabel, 'Reference: Previous Close');
      assert.equal(bharti.previousClose, 1715);
      // Verifies honest labeling in Telegram message: Reference price, NOT Pivot
      assert.ok(res.message?.includes('Reference: <b>₹1715.00</b> (Previous Close)'));
      assert.ok(res.message?.includes('Status: <i>Candidate selection only — no entry trigger established</i>'));
      assert.ok(!res.message?.includes('Pivot: <b>₹1715.00</b>'));
    });

    it('disclaims clearly that WATCH is not an entry recommendation and does not invent targets', async () => {
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.ok(res.message?.includes('WATCH ONLY'));
      assert.ok(res.message?.includes('Not an entry recommendation'));
      assert.ok(res.message?.includes(`Valid for session ${expectedNextSession}`));
      // Verifies NO manufactured target or stop-loss numbers are asserted
      assert.ok(!res.message?.includes('Target 1:'));
      assert.ok(!res.message?.includes('Stop Loss:'));
    });
  });

  describe('4. Deduplication & Cross-Module Annotations', () => {
    it('deduplicates a symbol appearing in multiple modules and annotates cross-membership', async () => {
      // Simulate TRENT qualifying in both Multi-Year and 52W Pattern
      PatternBreakoutService.getPatternBreakoutReport = async () => ({
        ...mockPatternReport,
        stocks: [
          {
            ...mockPatternReport.stocks[0]!,
            symbol: 'TRENT', // Duplicate symbol
          },
        ],
      });

      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      // TRENT should appear only ONCE in candidates
      const trentHits = res.candidates?.filter((c: WatchCandidate) => c.symbol === 'TRENT');
      assert.equal(trentHits?.length, 1);
      assert.equal(trentHits?.[0]!.module, 'MULTI_YEAR'); // Retains higher-priority module
      // Cross tag should note membership in 52W Pattern
      assert.ok(trentHits?.[0]!.crossModuleTags?.includes('52W Pattern'));
      assert.ok(res.message?.includes('Also: <i>52W Pattern</i>'));
    });

    it('enforces global candidate cap strictly across modules with deterministic backfill', async () => {
      // Create reports with 3 candidates each (9 total across 3 modules)
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        stocks: [
          { ...mockMultiYearReport.stocks[0]!, symbol: 'MYB1' },
          { ...mockMultiYearReport.stocks[0]!, symbol: 'MYB2' },
          { ...mockMultiYearReport.stocks[0]!, symbol: 'MYB3' },
        ],
      });
      PatternBreakoutService.getPatternBreakoutReport = async () => ({
        ...mockPatternReport,
        stocks: [
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT1' },
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT2' },
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT3' },
        ],
      });
      MomentumLeadersService.getMomentumLeadersReport = async () => ({
        ...mockMomentumReport,
        topLeaders: [
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM1' },
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM2' },
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM3' },
        ],
      });

      // Request a strict cap of 4 candidates total
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        maxCandidates: 4,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.equal(res.ready, true);
      assert.equal(res.candidateCount, 4);
      assert.equal(res.candidates?.length, 4);
    });

    it('backfills spare capacity deterministically when one module is under-subscribed', async () => {
      // Multi-Year has only 1 candidate, Pattern has 5, Momentum has 4
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        stocks: [
          { ...mockMultiYearReport.stocks[0]!, symbol: 'ONLY_ONE_MYB' },
        ],
      });
      PatternBreakoutService.getPatternBreakoutReport = async () => ({
        ...mockPatternReport,
        stocks: [
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT_A', scoreBreakdown: { ...mockPatternReport.stocks[0]!.scoreBreakdown, totalScore: 99 } },
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT_B', scoreBreakdown: { ...mockPatternReport.stocks[0]!.scoreBreakdown, totalScore: 95 } },
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT_C', scoreBreakdown: { ...mockPatternReport.stocks[0]!.scoreBreakdown, totalScore: 90 } },
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT_D', scoreBreakdown: { ...mockPatternReport.stocks[0]!.scoreBreakdown, totalScore: 85 } },
          { ...mockPatternReport.stocks[0]!, symbol: 'PAT_E', scoreBreakdown: { ...mockPatternReport.stocks[0]!.scoreBreakdown, totalScore: 80 } },
        ],
      });
      MomentumLeadersService.getMomentumLeadersReport = async () => ({
        ...mockMomentumReport,
        topLeaders: [
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM_A', compositeScore: 98 },
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM_B', compositeScore: 92 },
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM_C', compositeScore: 88 },
          { ...mockMomentumReport.topLeaders[0]!, symbol: 'MOM_D', compositeScore: 84 },
        ],
      });

      // maxCandidates = 6: Pass 1 allocates floor(6/3)=2 per module (MYB gets 1, PAT gets 2, MOM gets 2 = 5 total)
      // Pass 2 backfills the 1 spare slot from Pattern (next highest priority module) -> total 6
      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        maxCandidates: 6,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.equal(res.ready, true);
      assert.equal(res.candidateCount, 6);
      assert.equal(res.candidates?.length, 6);

      const mybCount = res.candidates?.filter(c => c.module === 'MULTI_YEAR').length;
      const patCount = res.candidates?.filter(c => c.module === 'PATTERN').length;
      const momCount = res.candidates?.filter(c => c.module === 'MOMENTUM').length;

      assert.equal(mybCount, 1); // 1 available
      assert.equal(patCount, 3); // 2 from Pass 1 + 1 backfilled from Pass 2
      assert.equal(momCount, 2); // 2 from Pass 1
    });

    it('handles empty results across all three modules gracefully', async () => {
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        stocks: [],
      });
      PatternBreakoutService.getPatternBreakoutReport = async () => ({
        ...mockPatternReport,
        stocks: [],
      });
      MomentumLeadersService.getMomentumLeadersReport = async () => ({
        ...mockMomentumReport,
        topLeaders: [],
      });

      const res = await MarketToolsWatchService.assembleWatchReport({
        targetDate: scanDate,
        now: new Date('2026-10-14T14:00:00.000Z'),
      });

      assert.equal(res.ready, true);
      assert.equal(res.candidateCount, 0);
      assert.ok(res.message?.includes('No qualifying candidates found'));
    });
  });

  describe('5. Safe Dispatch & Dry-Run Protection', () => {
    it('dry-run mode generates formatted message without calling TelegramService', async () => {
      let telegramCalled = false;
      const originalSend = TelegramService.sendRawMessage;
      TelegramService.sendRawMessage = async () => {
        telegramCalled = true;
        return { ok: true };
      };

      try {
        const res = await MarketToolsWatchService.dispatchWatchAlerts({
          dryRun: true,
          forceDate: scanDate,
        });

        assert.equal(res.success, true);
        assert.equal(res.sent, false);
        assert.equal(res.dryRun, true);
        assert.equal(telegramCalled, false);
        assert.ok(res.message?.includes('CPR PRO — MARKET TOOLS WATCHLIST'));
      } finally {
        TelegramService.sendRawMessage = originalSend;
      }
    });

    it('handles Telegram failure gracefully with structured return', async () => {
      const originalSend = TelegramService.sendRawMessage;
      TelegramService.sendRawMessage = async () => {
        return { ok: false, reason: 'telegram_api_error: HTTP 429' };
      };

      try {
        const res = await MarketToolsWatchService.dispatchWatchAlerts({
          dryRun: false,
          forceDate: scanDate,
        });

        assert.equal(res.success, false);
        assert.equal(res.sent, false);
        assert.equal(res.deliveryStatus, 'failed');
        assert.equal(res.reportId, `market-tools-watch:${scanDate}:${expectedNextSession}`);
        assert.equal(res.reason, 'telegram_api_error: HTTP 429');
      } finally {
        TelegramService.sendRawMessage = originalSend;
      }
    });

    it('classifies network/timeout error as delivery_unknown with stable reportId and retains scheduler claim', async () => {
      const originalSend = TelegramService.sendRawMessage;
      TelegramService.sendRawMessage = async () => {
        return { ok: false, reason: 'fetch_error: The operation was aborted' };
      };

      try {
        const res = await MarketToolsWatchService.dispatchWatchAlerts({
          dryRun: false,
          forceDate: scanDate,
        });

        assert.equal(res.success, false);
        assert.equal(res.sent, false);
        assert.equal(res.deliveryStatus, 'delivery_unknown');
        assert.equal(res.reportId, `market-tools-watch:${scanDate}:${expectedNextSession}`);
        assert.ok(res.reason?.includes('fetch_error'));

        // shouldCompleteClaimedJob must evaluate to true to retain claim and prevent automatic duplicate retries
        const shouldComplete = shouldCompleteClaimedJob(res);
        assert.equal(shouldComplete, true, 'Uncertain delivery must retain claim to suppress duplicate send');
      } finally {
        TelegramService.sendRawMessage = originalSend;
      }
    });
  });

  describe('6. Route Security, dryRun & Claim Isolation', () => {
    const testSecret = 'watch-test-secret-123';

    beforeEach(() => {
      process.env.CRON_SECRET = testSecret;
      env.CRON_SECRET = testSecret;
      resetCronRunClaims();
    });

    it('rejects unauthorized requests without header secret with 401', async () => {
      const req = new Request('http://localhost/api/cron/market-tools-watch');
      const res = await marketToolsWatchRoute(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error, 'Unauthorized');
    });

    it('rejects query param secret when header is missing with 401', async () => {
      const req = new Request(`http://localhost/api/cron/market-tools-watch?secret=${testSecret}`);
      const res = await marketToolsWatchRoute(req);
      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error, 'Unauthorized');
    });

    it('dryRun=true executes without locking claim or sending telegram', async () => {
      const req = new Request('http://localhost/api/cron/market-tools-watch?dryRun=true&force=true', {
        headers: { 'x-cron-secret': testSecret },
      });
      const res = await marketToolsWatchRoute(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.dryRun, true);
      assert.equal(json.sent, false);
      assert.equal(json.success, true);
      assert.ok(json.message?.includes('CPR PRO — MARKET TOOLS WATCHLIST'));
    });

    it('production mode enforces claim isolation and prevents duplicate executions', async () => {
      const req1 = new Request('http://localhost/api/cron/market-tools-watch', {
        headers: { 'x-cron-secret': testSecret },
      });

      // Mock Telegram to succeed
      const originalSend = TelegramService.sendRawMessage;
      TelegramService.sendRawMessage = async () => ({ ok: true });

      try {
        const res1 = await marketToolsWatchRoute(req1);
        const json1 = await res1.json();

        // Either succeeded (on weekday trading day) or skipped (if running test on weekend)
        if (json1.skipped && json1.reason === 'not_a_trading_day') {
          assert.equal(res1.status, 200);
        } else {
          assert.equal(res1.status, 200);
          assert.equal(json1.success, true);
          assert.equal(json1.sent, true);

          // Second request for the same day must be rejected by the claim lock
          const req2 = new Request('http://localhost/api/cron/market-tools-watch', {
            headers: { 'x-cron-secret': testSecret },
          });
          const res2 = await marketToolsWatchRoute(req2);
          const json2 = await res2.json();
          assert.equal(json2.skipped, true);
          assert.equal(json2.reason, 'already run or in progress');
        }
      } finally {
        TelegramService.sendRawMessage = originalSend;
      }
    });

    it('scheduler claim lifecycle: releases claim on precompute_not_ready and retains claim on success preventing double dispatch', async () => {
      const claimKey = `market-tools-watch:${scanDate}`;

      // Scenario A: Precompute is pending at 19:30 IST
      // 1. Claim acquired
      const claimedA = await tryClaimCronRun(claimKey);
      assert.equal(claimedA, true);

      // 2. dispatchWatchAlerts returns failure because of pending precompute
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        status: 'pending',
      });
      const pendingResult = await MarketToolsWatchService.dispatchWatchAlerts({ dryRun: false, forceDate: scanDate });
      assert.equal(pendingResult.success, false);
      assert.equal(pendingResult.sent, false);

      // 3. shouldCompleteClaimedJob evaluates failure -> false (triggers releaseCronRun)
      const shouldCompleteA = shouldCompleteClaimedJob(pendingResult);
      assert.equal(shouldCompleteA, false);

      // Simulate scheduler releasing the claim upon false evaluation
      resetCronRunClaims();

      // Scenario B: Precompute completes at 19:32 IST
      // 1. Re-acquire claim on subsequent poll tick
      const claimedB = await tryClaimCronRun(claimKey);
      assert.equal(claimedB, true);

      // 2. dispatchWatchAlerts succeeds and sends Telegram
      MultiYearBreakoutService.getBreakoutReport = async () => mockMultiYearReport;
      const originalSend = TelegramService.sendRawMessage;
      let telegramCallCount = 0;
      TelegramService.sendRawMessage = async () => {
        telegramCallCount++;
        return { ok: true };
      };

      try {
        const successResult = await MarketToolsWatchService.dispatchWatchAlerts({ dryRun: false, forceDate: scanDate });
        assert.equal(successResult.success, true);
        assert.equal(successResult.sent, true);
        assert.equal(telegramCallCount, 1);

        // 3. shouldCompleteClaimedJob evaluates success -> true (triggers completeCronRun with retainClaim=true)
        const shouldCompleteB = shouldCompleteClaimedJob(successResult);
        assert.equal(shouldCompleteB, true);

        // Scheduler commits the claim lock for 24h
        await completeCronRun(claimKey, true);

        // Scenario C: Subsequent scheduler tick at 19:33 IST attempts to run
        const claimedC = await tryClaimCronRun(claimKey);
        assert.equal(claimedC, false); // Locked by cron_done:market-tools-watch:2026-10-14
        assert.equal(telegramCallCount, 1); // Strictly prevented from dispatching twice
      } finally {
        TelegramService.sendRawMessage = originalSend;
      }
    });

    it('simulates a delayed precompute job spanning across the 19:30 boundary and confirms WATCH eventually sends once reports become ready', async () => {
      resetCronRunClaims();
      const dateKey = scanDate;

      // 1. Verify window behavior around boundaries
      // 19:15 IST (Wednesday) -> Precompute open, Watch closed
      const t1915 = new Date('2026-10-14T13:45:00.000Z'); // 19:15 IST
      assert.equal(isMarketToolsPrecomputeWindowOpen(t1915), true);
      assert.equal(isMarketToolsWatchWindowOpen(t1915), false);

      // 19:29 IST -> Precompute open, Watch closed
      const t1929 = new Date('2026-10-14T13:59:00.000Z'); // 19:29 IST
      assert.equal(isMarketToolsPrecomputeWindowOpen(t1929), true);
      assert.equal(isMarketToolsWatchWindowOpen(t1929), false);

      // 19:31 IST (after crossing 19:30 boundary) -> Precompute open, Watch open
      const t1931 = new Date('2026-10-14T14:01:00.000Z'); // 19:31 IST
      assert.equal(isMarketToolsPrecomputeWindowOpen(t1931), true);
      assert.equal(isMarketToolsWatchWindowOpen(t1931), true);

      // 20:00 IST (extended retry window) -> Precompute closed, Watch open
      const t2000 = new Date('2026-10-14T14:30:00.000Z'); // 20:00 IST
      assert.equal(isMarketToolsPrecomputeWindowOpen(t2000), false);
      assert.equal(isMarketToolsWatchWindowOpen(t2000), true);

      // 21:35 IST (after 21:30 cutoff) -> Precompute closed, Watch closed
      const t2135 = new Date('2026-10-14T16:05:00.000Z'); // 21:35 IST
      assert.equal(isMarketToolsPrecomputeWindowOpen(t2135), false);
      assert.equal(isMarketToolsWatchWindowOpen(t2135), false);

      // 2. Scheduler-level simulation:
      // Precompute starts at 19:29:50 IST and runs for ~3 minutes, finishing at 19:32:50 IST (spanning 19:30 boundary).
      // When precompute finishes, reports are not immediately ready (status: 'pending').
      MultiYearBreakoutService.getBreakoutReport = async () => ({
        ...mockMultiYearReport,
        status: 'pending',
      });
      let telegramCallCount = 0;
      const originalSend = TelegramService.sendRawMessage;
      TelegramService.sendRawMessage = async () => {
        telegramCallCount++;
        return { ok: true };
      };

      try {
        // Tick 1 at 19:32 IST: precompute has crossed the 19:30 boundary.
        // Scheduler executes runMarketToolsWatchJob(dateKey) because current clock is in WATCH window.
        await runMarketToolsWatchJob(dateKey);
        // Precompute was not ready -> claim was released, Telegram was not called
        assert.equal(telegramCallCount, 0);

        // Tick 2 at 19:34 IST: Precompute reports have now completed and are ready!
        MultiYearBreakoutService.getBreakoutReport = async () => mockMultiYearReport;
        await runMarketToolsWatchJob(dateKey);

        // WATCH sends successfully!
        assert.equal(telegramCallCount, 1);

        // Tick 3 at 19:50 IST (past old 19:45 window): Another tick occurs
        await runMarketToolsWatchJob(dateKey);

        // Claim lock prevents duplicate dispatch
        assert.equal(telegramCallCount, 1);
      } finally {
        TelegramService.sendRawMessage = originalSend;
      }
    });
  });
});
