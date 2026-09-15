import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EarningsPopulatorService } from '../../services/earnings-populator.service';
import { MarketService } from '../../services/market.service';
import YahooFinance from 'yahoo-finance2';

describe('EarningsPopulatorService Yahoo Finance timeout resilience', () => {
  it('handles hung Yahoo Finance request gracefully via per-symbol timeout', async () => {
    const origGetUniverse = MarketService.getUniverse;
    const origFetch = globalThis.fetch;
    const origQuoteSummary = YahooFinance.prototype.quoteSummary;

    MarketService.getUniverse = () => [
      { symbol: 'HUNG_STOCK' },
      { symbol: 'FAST_STOCK' },
    ] as any;

    // Simulate NSE failure so all symbols go to Yahoo fallback
    globalThis.fetch = async () => {
      throw new Error('NSE offline');
    };

    let hungCalled = false;
    let fastCalled = false;

    YahooFinance.prototype.quoteSummary = async function (symbol: string, _options?: any) {
      if (symbol === 'HUNG_STOCK.NS') {
        hungCalled = true;
        // Hung promise that never resolves
        return new Promise(() => {});
      }
      if (symbol === 'FAST_STOCK.NS') {
        fastCalled = true;
        return {
          calendarEvents: {
            earnings: {
              earningsDate: ['2026-09-15'],
              isEarningsDateEstimate: false,
            },
          },
        } as any;
      }
      return {} as any;
    };

    try {
      const startTime = Date.now();
      // Dry run with a 50ms per-symbol timeout
      const result = await EarningsPopulatorService.populate(true, 50);
      const elapsed = Date.now() - startTime;

      assert.equal(hungCalled, true, 'HUNG_STOCK should have been called');
      assert.equal(fastCalled, true, 'FAST_STOCK should have been called');
      assert.equal(result.yahooCount, 1, 'FAST_STOCK should have succeeded');
      // Should complete quickly around 50-500ms, not hang
      assert.ok(elapsed < 2000, `Execution should complete quickly; took ${elapsed}ms`);
    } finally {
      MarketService.getUniverse = origGetUniverse;
      globalThis.fetch = origFetch;
      YahooFinance.prototype.quoteSummary = origQuoteSummary;
    }
  });

  it('processes normal Yahoo Finance responses correctly within timeout', async () => {
    const origGetUniverse = MarketService.getUniverse;
    const origFetch = globalThis.fetch;
    const origQuoteSummary = YahooFinance.prototype.quoteSummary;

    MarketService.getUniverse = () => [
      { symbol: 'STOCK_A' },
      { symbol: 'STOCK_B' },
    ] as any;

    globalThis.fetch = async () => {
      throw new Error('NSE offline');
    };

    YahooFinance.prototype.quoteSummary = async function (_symbol: string, _options?: any) {
      return {
        calendarEvents: {
          earnings: {
            earningsDate: ['2026-09-20'],
            isEarningsDateEstimate: true,
          },
        },
      } as any;
    };

    try {
      const result = await EarningsPopulatorService.populate(true, 200);
      assert.equal(result.yahooCount, 2, 'Both stocks should be populated from Yahoo');
    } finally {
      MarketService.getUniverse = origGetUniverse;
      globalThis.fetch = origFetch;
      YahooFinance.prototype.quoteSummary = origQuoteSummary;
    }
  });

  it('rejects non-array and malformed event responses from NSE (Finding 3)', async () => {
    const origFetch = globalThis.fetch;
    const origGetUniverse = MarketService.getUniverse;
    MarketService.getUniverse = () => [] as any;

    try {
      // 1. Non-array response (e.g. error object or HTML response)
      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('nseindia.com') && !urlStr.includes('event-calendar')) {
          return new Response('', { headers: { 'set-cookie': 'nseapp=1; Path=/' } });
        }
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof globalThis.fetch;

      const resNonArray = await EarningsPopulatorService.populate(true, 50);
      assert.ok(
        resNonArray.errors.some((e) => /expected an array of events/i.test(e)),
        `Expected non-array error in result.errors, got: ${JSON.stringify(resNonArray.errors)}`
      );

      // 2. Malformed array where items lack expected fields
      globalThis.fetch = (async (url: string | URL | Request) => {
        const urlStr = String(url);
        if (urlStr.includes('nseindia.com') && !urlStr.includes('event-calendar')) {
          return new Response('', { headers: { 'set-cookie': 'nseapp=1; Path=/' } });
        }
        return new Response(JSON.stringify([{ unexpectedField: 123 }, { anotherBogusField: 'bad' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof globalThis.fetch;

      const resMalformed = await EarningsPopulatorService.populate(true, 50);
      assert.ok(
        resMalformed.errors.some((e) => /payload malformed: events lack expected/i.test(e)),
        `Expected malformed error in result.errors, got: ${JSON.stringify(resMalformed.errors)}`
      );
    } finally {
      globalThis.fetch = origFetch;
      MarketService.getUniverse = origGetUniverse;
    }
  });

  it('respects sendAlert parameter on failure (does not send Telegram alert when false)', async () => {
    const { TelegramService } = await import('../../services/alert/telegram.service');
    const origSendMessage = TelegramService.sendMessage;
    const origGetUniverse = MarketService.getUniverse;
    const origFetch = globalThis.fetch;

    let alertSent = false;
    TelegramService.sendMessage = async () => {
      alertSent = true;
      return { ok: true };
    };

    MarketService.getUniverse = () => [] as any;
    globalThis.fetch = async () => {
      throw new Error('NSE offline');
    };

    try {
      // 1. sendAlert = false, dryRun = false -> alert should NOT be sent
      alertSent = false;
      const resSuppressed = await EarningsPopulatorService.populate(false, 50, false);
      assert.equal(resSuppressed.success, false);
      assert.equal(alertSent, false, 'Telegram alert should be suppressed when sendAlert=false');

      // 2. sendAlert = true, dryRun = false -> alert SHOULD be sent
      alertSent = false;
      const resAlerted = await EarningsPopulatorService.populate(false, 50, true);
      assert.equal(resAlerted.success, false);
      assert.equal(alertSent, true, 'Telegram alert should be sent when sendAlert=true');
      assert.equal(resAlerted.alertSent, true, 'alertSent should be true when Telegram delivery succeeds');

      // 3. Telegram delivery returns ok: false -> alertSent should be false
      TelegramService.sendMessage = async () => ({ ok: false, reason: 'rate_limited' });
      const resFailedDelivery = await EarningsPopulatorService.populate(false, 50, true);
      assert.equal(resFailedDelivery.success, false);
      assert.equal(resFailedDelivery.alertSent, false, 'alertSent should be false when Telegram delivery fails');

      // 4. Telegram delivery throws error -> alertSent should be false
      TelegramService.sendMessage = async () => { throw new Error('network down'); };
      const resThrownDelivery = await EarningsPopulatorService.populate(false, 50, true);
      assert.equal(resThrownDelivery.success, false);
      assert.equal(resThrownDelivery.alertSent, false, 'alertSent should be false when Telegram delivery throws');
    } finally {
      TelegramService.sendMessage = origSendMessage;
      MarketService.getUniverse = origGetUniverse;
      globalThis.fetch = origFetch;
    }
  });
});

