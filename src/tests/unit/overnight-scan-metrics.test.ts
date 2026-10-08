import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyOvernightScanMetrics,
  finalizeOvernightScanMetrics,
  formatOvernightScanMetricsSummary,
} from '../../services/overnight/overnight-scan-metrics';
import { OvernightService } from '../../services/overnight/overnight.service';
import { RegimeService } from '../../services/overnight/regime.service';
import { EventCalendarService } from '../../services/overnight/event.service';
import { prisma } from '../../lib/db';

describe('OvernightScanMetrics Pure Helpers (M-5)', () => {
  it('initializes empty metrics with correct universeSize and zero counters', () => {
    const m = createEmptyOvernightScanMetrics(196);
    assert.strictEqual(m.universeSize, 196);
    assert.strictEqual(m.processed, 0);
    assert.strictEqual(m.saved, 0);
    assert.strictEqual(m.passed, 0);
    assert.strictEqual(m.droppedNoStockData, 0);
    assert.strictEqual(m.droppedNoIntraday, 0);
    assert.strictEqual(m.droppedEligibility, 0);
    assert.strictEqual(m.droppedRegime, 0);
    assert.strictEqual(m.droppedFridayGate, 0);
    assert.strictEqual(m.droppedExtension, 0);
    assert.strictEqual(m.droppedConflict, 0);
    assert.strictEqual(m.droppedIgnore, 0);
    assert.strictEqual(m.droppedVpaGate, 0);
    assert.strictEqual(m.errors, 0);
  });

  it('finalizes metrics by updating saved and passed counts', () => {
    const m = createEmptyOvernightScanMetrics(50);
    finalizeOvernightScanMetrics(m, 5);
    assert.strictEqual(m.saved, 5);
    assert.strictEqual(m.passed, 5);
  });

  it('formats single-line structured summary matching specification', () => {
    const m = createEmptyOvernightScanMetrics(196);
    m.processed = 190;
    m.saved = 2;
    m.droppedEligibility = 142;
    m.droppedRegime = 32;
    m.droppedFridayGate = 0;
    m.droppedExtension = 12;
    m.droppedConflict = 5;
    m.droppedNoIntraday = 8;
    m.droppedIgnore = 3;
    m.errors = 1;

    const summary = formatOvernightScanMetricsSummary('2026-10-08', '15:20', m);
    assert.strictEqual(
      summary,
      '[OvernightScan] date=2026-10-08 time=15:20 universe=196 processed=190 saved=2 ' +
        'eligibility=142 regime=32 friday=0 extension=12 conflict=5 noIntraday=8 ignore=3 errors=1'
    );
  });
});

describe('OvernightService.discover Funnel Observability Integration (M-5)', () => {
  it('tracks funnel drop metrics across mock universe', async () => {
    const origGetRegime = RegimeService.getMarketRegime;
    const origGetBulkEvent = EventCalendarService.getBulkEventRisk;
    const origGetMacro = EventCalendarService.getMacroEventRisk;
    const origTx = prisma.$transaction;
    const origUpsert = (globalThis as any).prisma?.overnightSignal?.upsert;

    try {
      // Mock regime: BULL
      RegimeService.getMarketRegime = async () => ({
        trend: 'BULL' as const,
        volatility: 'LOW' as const,
        score: 80,
        niftyClose: 24500,
        niftyEma20: 24200,
        niftyReturn5d: 1.2,
        reliable: true,
      });
      EventCalendarService.getBulkEventRisk = async () => ({});
      EventCalendarService.getMacroEventRisk = async () => ({
        severity: 0,
        reason: null,
        source: 'LOCAL_DB',
        confidence: 'HIGH',
      });

      (globalThis as any).prisma.overnightSignal.upsert = (args: any) => args;
      // Mock prisma transaction to avoid external DB reliance
      (globalThis as any).prisma.$transaction = async (ops: any[]) => {
        return ops.map((op: any, i: number) => ({
          id: `sig-${i}`,
          symbol: op.create?.symbol ?? 'UNKNOWN',
          direction: op.create?.direction ?? 'LONG',
          signalDate: op.create?.signalDate ?? '2026-10-07',
          signalTime: op.create?.signalTime ?? '15:20',
          overnightScore: op.create?.overnightScore ?? 85,
          classification: op.create?.classification ?? 'BTST_READY',
          qualityBucket: 'TRADEABLE',
          entry: op.create?.entry ?? 100,
          stopLoss: op.create?.stopLoss ?? 95,
          target: op.create?.target ?? 110,
          createdAt: new Date(),
        }));
      };

      const history = Array.from({ length: 25 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, '0')}`,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        volume: 200_000,
      }));

      // Stock 1: Empty history (drops at data availability)
      const stockNoHistory = {
        symbol: 'MOCK_NODATA',
        market: 'NSE' as const,
        sector: 'IT',
        open: 100,
        high: 105,
        low: 95,
        close: 102,
        ltp: 102,
        volume: 200_000,
        avgVolume: 150_000,
        marketCap: 10_000,
        history: [],
      };

      // Stock 2: Illiquid volume (drops at eligibility)
      const stockIlliquid = {
        symbol: 'MOCK_ILLIQ',
        market: 'NSE' as const,
        sector: 'AUTO',
        open: 50,
        high: 52,
        low: 49,
        close: 50,
        ltp: 50,
        volume: 20_000, // below 100k floor
        avgVolume: 30_000,
        marketCap: 5_000,
        history,
      };

      // Stock 3: Liquid and scored (saves signal)
      const stockLiquid = {
        symbol: 'MOCK_PASS',
        market: 'NSE' as const,
        sector: 'FINANCE',
        open: 101,
        high: 104,
        low: 100,
        close: 103,
        ltp: 103,
        volume: 400_000,
        avgVolume: 200_000,
        marketCap: 50_000,
        history,
        longScoreOverride: 92,
        shortScoreOverride: 40,
      };

      const results = await OvernightService.discover(
        'BOTH',
        new Date('2026-10-07T09:45:00.000Z'), // Wednesday 15:15 IST
        [stockNoHistory as any, stockIlliquid as any, stockLiquid as any]
      );

      const metrics = results.metrics ?? OvernightService.getLastScanMetrics();
      assert.ok(metrics, 'Expected metrics to be present on results or getLastScanMetrics()');

      assert.strictEqual(metrics.universeSize, 3);
      assert.strictEqual(metrics.processed, 3);
      assert.strictEqual(metrics.droppedNoStockData, 1);
      assert.strictEqual(metrics.droppedEligibility, 1);
      assert.strictEqual(metrics.saved, 1);

      // Invariant check: saved + mutually exclusive drops === processed
      const totalAttributed = metrics.saved + metrics.droppedNoStockData + metrics.droppedEligibility;
      assert.strictEqual(totalAttributed, metrics.processed);
    } finally {
      RegimeService.getMarketRegime = origGetRegime;
      EventCalendarService.getBulkEventRisk = origGetBulkEvent;
      EventCalendarService.getMacroEventRisk = origGetMacro;
      if (origUpsert) {
        (globalThis as any).prisma.overnightSignal.upsert = origUpsert;
      }
      (globalThis as any).prisma.$transaction = origTx;
    }
  });
});
