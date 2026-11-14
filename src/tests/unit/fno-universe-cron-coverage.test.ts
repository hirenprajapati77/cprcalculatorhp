import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/app/api/cron/fno-universe-check/route';
import { FnoUniverseCheckService } from '@/services/fno-universe-check.service';
import { MarketBreadthService } from '@/services/market-tools/market-breadth.service';
import { TelegramService } from '@/services/alert/telegram.service';
import { env } from '@/config/env';

test('F&O Universe Cron coverage wiring (Fix 3 runtime guard)', async (t) => {
  const originalCheckDrift = FnoUniverseCheckService.checkDrift;
  const originalCheckCoverage = MarketBreadthService.checkUniverseCoverage;
  const originalSendMessage = TelegramService.sendMessage;
  const originalCronSecret = env.CRON_SECRET;

  t.afterEach(() => {
    FnoUniverseCheckService.checkDrift = originalCheckDrift;
    MarketBreadthService.checkUniverseCoverage = originalCheckCoverage;
    TelegramService.sendMessage = originalSendMessage;
    env.CRON_SECRET = originalCronSecret;
  });

  await t.test('rejects unauthorized cron requests', async () => {
    env.CRON_SECRET = 'valid-test-secret';
    const req = new Request('http://localhost/api/cron/fno-universe-check', {
      headers: { 'x-cron-secret': 'invalid-secret' },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 401);
  });

  await t.test('calls MarketBreadthService.checkUniverseCoverage and returns coverage payload', async () => {
    env.CRON_SECRET = 'valid-test-secret';

    let coverageCalled = false;
    let driftCalled = false;

    FnoUniverseCheckService.checkDrift = async () => {
      driftCalled = true;
      return {
        ok: true,
        data: {
          checkedAt: '2026-11-13T20:00:00.000Z',
          nseListCount: 180,
          localListCount: 180,
          newlyEligible: [],
          newlyIneligible: [],
          symbolsOnlyInNse: [],
          hasDrift: false,
          appliedToRuntime: true,
        },
      };
    };

    MarketBreadthService.checkUniverseCoverage = async () => {
      coverageCalled = true;
      return {
        missingNifty50: [],
        missingFno: [],
      };
    };

    const req = new Request('http://localhost/api/cron/fno-universe-check', {
      headers: { 'x-cron-secret': 'valid-test-secret' },
    });

    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.ok(driftCalled, 'FnoUniverseCheckService.checkDrift must be called');
    assert.ok(coverageCalled, 'MarketBreadthService.checkUniverseCoverage must be called at runtime');

    const json = await res.json();
    assert.ok(json.coverage, 'Response must include coverage object');
    assert.deepStrictEqual(json.coverage.missingNifty50, []);
    assert.deepStrictEqual(json.coverage.missingFno, []);
  });

  await t.test('dispatches alert when universe coverage gaps are detected even with no drift', async () => {
    env.CRON_SECRET = 'valid-test-secret';

    FnoUniverseCheckService.checkDrift = async () => ({
      ok: true,
      data: {
        checkedAt: '2026-11-13T20:00:00.000Z',
        nseListCount: 180,
        localListCount: 180,
        newlyEligible: [],
        newlyIneligible: [],
        symbolsOnlyInNse: [],
        hasDrift: false,
        appliedToRuntime: true,
      },
    });

    MarketBreadthService.checkUniverseCoverage = async () => ({
      missingNifty50: ['DELISTED50'],
      missingFno: ['OLD_FNO_TICKER'],
    });

    let sentTelegramMessage = '';
    TelegramService.sendMessage = async (msg: string) => {
      sentTelegramMessage = msg;
      return { ok: true };
    };

    const req = new Request('http://localhost/api/cron/fno-universe-check', {
      headers: { 'x-cron-secret': 'valid-test-secret' },
    });

    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    assert.ok(sentTelegramMessage.length > 0, 'Telegram alert must be fired on coverage gap');
    assert.match(sentTelegramMessage, /DELISTED50/);
    assert.match(sentTelegramMessage, /OLD_FNO_TICKER/);
  });
});
