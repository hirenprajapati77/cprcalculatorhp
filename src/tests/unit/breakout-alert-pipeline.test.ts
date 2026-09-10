import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapScanResultsForBreakoutAlert } from '@/services/alert/breakout-alert.pipeline';

describe('mapScanResultsForBreakoutAlert', () => {
  it('fills entry/sl/target fallbacks from tc/bc/r1 and ltp', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      {
        symbol: 'WIPRO',
        signals: ['BREAKOUT'],
        ltp: 100,
        tc: 101,
        bc: 99,
        r1: 105,
        score: 80,
        sector: 'IT',
        eventRiskScore: 10,
      },
    ]);
    assert.equal(mapped.entry, 101);
    assert.equal(mapped.sl, 99);
    assert.equal(mapped.target, 105);
    assert.equal(mapped.rr, '1:1.5');
    assert.equal(mapped.score, 80);
    assert.deepEqual(mapped.signals, ['BREAKOUT']);
  });

  it('uses ltp-based fallbacks when levels are missing', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      { symbol: 'SBIN', ltp: 200, signals: null },
    ]);
    assert.equal(mapped.entry, 200);
    assert.equal(mapped.sl, 198);
    assert.equal(mapped.target, 204);
    assert.equal(mapped.score, 0);
    assert.equal(mapped.sector, 'Other');
    assert.deepEqual(mapped.signals, []);
  });

  it('computes atrPct percent from history for L3 chase cap', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      {
        symbol: 'ITC',
        ltp: 400,
        signals: ['BREAKOUT'],
        history: Array.from({ length: 16 }, (_, i) => ({
          date: `2026-07-${String(i + 1).padStart(2, '0')}`,
          high: 402,
          low: 398,
          close: 400,
        })),
      },
    ]);
    assert.ok(mapped.atrPct != null && mapped.atrPct > 0);
    assert.ok(mapped.atrPct < 5, 'ITC-like range should be a small percent, not a 0–1 fraction');
  });

  it('handles empty breakouts array in enrichBreakoutsWithOptionSuggestions', async () => {
    const { enrichBreakoutsWithOptionSuggestions } = await import('@/services/alert/breakout-alert.pipeline');
    const enriched = await enrichBreakoutsWithOptionSuggestions([]);
    assert.deepEqual(enriched, []);
  });

  it('enriches breakouts with option suggestions and handles per-stock errors gracefully', async () => {
    const { enrichBreakoutsWithOptionSuggestions } = await import('@/services/alert/breakout-alert.pipeline');
    const rows = [
      {
        symbol: 'RELIANCE',
        signals: ['BREAKOUT'],
        ltp: 2500,
        entry: 2500,
        sl: 2475,
        target: 2550,
        rr: '1:2',
        score: 85,
        sector: 'Energy',
        classification: 'NORMAL',
        eventRiskScore: 0,
      },
      {
        symbol: 'TCS_ERROR',
        signals: ['BREAKDOWN'],
        ltp: 3500,
        entry: 3500,
        sl: 3535,
        target: 3430,
        rr: '1:2',
        score: 80,
        sector: 'IT',
        classification: 'NORMAL',
        eventRiskScore: 0,
      },
    ];

    const mockSuggest = async (symbol: string) => {
      if (symbol === 'TCS_ERROR') {
        throw new Error('Simulation timeout or error');
      }
      return {
        formattedName: 'RELIANCE 2500 CE',
        strike: 2500,
        type: 'CE' as const,
        ltp: 45,
        target: 65,
        sl: 35,
        lotSize: 250,
        expiry: '2026-09-24',
        pcr: 1.2,
      };
    };

    const enriched = await enrichBreakoutsWithOptionSuggestions(rows, {
      batchSize: 2,
      timeoutMs: 1000,
      suggestOption: mockSuggest,
    });

    assert.equal(enriched.length, 2);
    assert.equal(enriched[0].optionSuggestion?.formattedName, 'RELIANCE 2500 CE');
    assert.equal(enriched[1].optionSuggestion, undefined);
  });

  it('maps BREAKDOWN signals using bc and tc fallbacks', () => {
    const [mapped] = mapScanResultsForBreakoutAlert([
      {
        symbol: 'DOWN_STOCK',
        signals: ['BREAKDOWN'],
        ltp: 500,
        bc: 495,
        tc: 505,
        target2: 480,
        rr2: '1:2.5',
        high: 510,
        low: 490,
        open: 508,
        previousClose: 509,
      },
    ]);
    assert.equal(mapped.entry, 495); // bc
    assert.equal(mapped.sl, 505); // tc
    assert.equal(mapped.target, 490); // 500 * 0.98
    assert.equal(mapped.target2, 480);
    assert.equal(mapped.rr2, '1:2.5');
    assert.equal(mapped.high, 510);
    assert.equal(mapped.low, 490);
    assert.equal(mapped.open, 508);
    assert.equal(mapped.previousClose, 509);
  });

  it('skips option suggestion when error or missing formattedName', async () => {
    const { enrichBreakoutsWithOptionSuggestions } = await import('@/services/alert/breakout-alert.pipeline');
    const rows = [
      {
        symbol: 'ERR_SUGG',
        signals: ['BREAKOUT'],
        ltp: 100,
        entry: 100,
        sl: 99,
        target: 102,
        rr: '1:2',
        score: 80,
        sector: 'IT',
      },
    ];
    const enriched = await enrichBreakoutsWithOptionSuggestions(rows, {
      suggestOption: async () => ({ error: 'No chain available' } as any),
    });
    assert.equal(enriched[0].optionSuggestion, undefined);
  });

  it('handles option suggestion timeout in enrichBreakoutsWithOptionSuggestions', async () => {
    const { enrichBreakoutsWithOptionSuggestions } = await import('@/services/alert/breakout-alert.pipeline');
    const rows = [
      {
        symbol: 'TIMEOUT_SUGG',
        signals: ['BREAKOUT'],
        ltp: 100,
        entry: 100,
        sl: 99,
        target: 102,
        rr: '1:2',
        score: 80,
        sector: 'IT',
      },
    ];
    const enriched = await enrichBreakoutsWithOptionSuggestions(rows, {
      timeoutMs: 10,
      suggestOption: () => new Promise((resolve) => setTimeout(resolve, 50)),
    });
    assert.equal(enriched[0].optionSuggestion, undefined);
  });

  it('notifyBreakoutsFromScan exits early when results are empty or degenerate', async () => {
    const { notifyBreakoutsFromScan } = await import('@/services/alert/breakout-alert.pipeline');
    assert.doesNotThrow(() => {
      notifyBreakoutsFromScan([]);
      notifyBreakoutsFromScan([
        { symbol: 'DEGEN1', ltp: 100, degenerateData: true },
        { symbol: 'DEGEN2', ltp: 100, signals: ['DEGENERATE_DATA'] },
      ]);
    });
  });

  it('notifyBreakoutsFromScan runs through detection, VIX gate, price gate, commit, enrich, and Telegram send', async () => {
    const { notifyBreakoutsFromScan } = await import('@/services/alert/breakout-alert.pipeline');
    const { BreakoutWatcherService } = await import('@/services/alert/breakout-watcher.service');
    const { TelegramService } = await import('@/services/alert/telegram.service');
    const { IndexDiscoverService } = await import('@/services/overnight/index-discover.service');
    const { prisma } = await import('@/lib/db');

    const origSrUpdate = (prisma as any).scannerResult.updateMany;
    (prisma as any).scannerResult.updateMany = async () => ({ count: 1 });
    const origBasUpdate = (prisma as any).breakoutAlertState.updateMany;
    (prisma as any).breakoutAlertState.updateMany = async () => ({ count: 1 });

    const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
    const origSuggest = OptionSuggestionService.suggestOption;
    OptionSuggestionService.suggestOption = async () => null as any;

    const origReleaseStale = BreakoutWatcherService.releaseStaleDeliveredClaims;
    const origDetect = BreakoutWatcherService.detectNewBreakouts;
    const origCommit = BreakoutWatcherService.commitClaims;
    const origVix = IndexDiscoverService.getIndiaVixState;
    const origSend = TelegramService.sendBreakoutAlert;
    const origRelease = BreakoutWatcherService.releaseClaims;
    const origSuppress = BreakoutWatcherService.suppressClaims;

    let telegramSent = false;
    let releasedClaims: string[] = [];

    try {
      BreakoutWatcherService.releaseStaleDeliveredClaims = async () => [];
      BreakoutWatcherService.detectNewBreakouts = async (items: any) => items;
      BreakoutWatcherService.commitClaims = async (items: any) => items;
      IndexDiscoverService.getIndiaVixState = async () =>
        ({
          regime: 'NORMAL' as const,
          vix: 14.5,
          prevVix: 14.2,
          elevated: false,
          vixCalm: true,
          latestClose: 14.5,
        }) as any;
      TelegramService.sendBreakoutAlert = async (items: any) => {
        telegramSent = true;
        return { ok: true, sentCount: items.length };
      };
      BreakoutWatcherService.releaseClaims = async (keys: string[]) => {
        releasedClaims = keys;
      };
      BreakoutWatcherService.suppressClaims = async () => {};

      notifyBreakoutsFromScan([
        {
          symbol: 'MOCK_PIPE',
          ltp: 100,
          entry: 100,
          sl: 98,
          target: 104,
          score: 85,
          signals: ['BREAKOUT'],
          sector: 'IT',
          high: 101,
          low: 99,
          open: 100,
          previousClose: 99,
        },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(telegramSent, true);

      // Test Telegram send failure branch -> calls releaseClaims
      telegramSent = false;
      TelegramService.sendBreakoutAlert = async () => ({
        ok: false,
        reason: 'network error',
      });
      notifyBreakoutsFromScan([
        {
          symbol: 'MOCK_FAIL',
          ltp: 200,
          entry: 200,
          sl: 196,
          target: 208,
          score: 85,
          signals: ['BREAKOUT'],
          sector: 'IT',
          high: 201,
          low: 199,
          open: 200,
          previousClose: 198,
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.ok(releasedClaims.length > 0);

      // Test outer pipeline error handling branch
      BreakoutWatcherService.detectNewBreakouts = async () => {
        throw new Error('Pipeline error simulation');
      };
      notifyBreakoutsFromScan([
        {
          symbol: 'MOCK_ERR',
          ltp: 300,
          signals: ['BREAKOUT'],
          score: 85,
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      BreakoutWatcherService.releaseStaleDeliveredClaims = origReleaseStale;
      BreakoutWatcherService.detectNewBreakouts = origDetect;
      BreakoutWatcherService.commitClaims = origCommit;
      IndexDiscoverService.getIndiaVixState = origVix;
      TelegramService.sendBreakoutAlert = origSend;
      BreakoutWatcherService.releaseClaims = origRelease;
      BreakoutWatcherService.suppressClaims = origSuppress;
      OptionSuggestionService.suggestOption = origSuggest;
      (prisma as any).scannerResult.updateMany = origSrUpdate;
      (prisma as any).breakoutAlertState.updateMany = origBasUpdate;
    }
  });
});
