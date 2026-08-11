import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAKOUT_OPTION_ENRICH_BATCH_SIZE,
  enrichBreakoutsWithOptionSuggestions,
} from '@/services/alert/breakout-alert.pipeline';
import { TelegramService } from '@/services/alert/telegram.service';
import { env } from '@/config/env';
import { prisma } from '@/lib/db';
import type { BreakoutScanResult } from '@/services/alert/breakout-watcher.service';
import type { OptionSuggestion } from '@/services/option-suggestion.service';

function baseBreakout(symbol: string, overrides: Partial<BreakoutScanResult> = {}): BreakoutScanResult {
  return {
    symbol,
    signals: ['BREAKOUT'],
    alertKind: 'BREAKOUT',
    ltp: 100,
    entry: 101,
    sl: 99,
    target: 105,
    rr: '1:2',
    score: 80,
    sector: 'IT',
    ...overrides,
  };
}

describe('enrichBreakoutsWithOptionSuggestions', () => {
  it('attaches successful option suggestions onto confirmed breakouts', async () => {
    const enriched = await enrichBreakoutsWithOptionSuggestions(
      [baseBreakout('RELIANCE')],
      {
        suggestOption: async (symbol) => ({
          formattedName: `${symbol} AUG 2500 CE`,
          ltp: 42.5,
        }),
      }
    );
    assert.equal(enriched[0].optionSuggestion?.formattedName, 'RELIANCE AUG 2500 CE');
    assert.equal(enriched[0].optionSuggestion?.ltp, 42.5);
  });

  it('omits optionSuggestion when lookup fails or times out (does not throw)', async () => {
    const enriched = await enrichBreakoutsWithOptionSuggestions(
      [baseBreakout('FAILCO'), baseBreakout('TIMEOUT')],
      {
        timeoutMs: 30,
        suggestOption: async (symbol) => {
          if (symbol === 'FAILCO') throw new Error('chain down');
          await new Promise((r) => setTimeout(r, 80));
          return { formattedName: 'never' };
        },
      }
    );
    assert.equal(enriched.length, 2);
    assert.equal(enriched[0].optionSuggestion, undefined);
    assert.equal(enriched[1].optionSuggestion, undefined);
  });

  it('caps concurrent fetches to BREAKOUT_OPTION_ENRICH_BATCH_SIZE (not unbounded Promise.all)', async () => {
    assert.equal(BREAKOUT_OPTION_ENRICH_BATCH_SIZE, 2);

    let inFlight = 0;
    let maxInFlight = 0;
    const startOrder: string[] = [];

    const stocks = Array.from({ length: 6 }, (_, i) => baseBreakout(`SYM${i}`));

    await enrichBreakoutsWithOptionSuggestions(stocks, {
      batchSize: BREAKOUT_OPTION_ENRICH_BATCH_SIZE,
      suggestOption: async (symbol) => {
        startOrder.push(symbol);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 40));
        inFlight -= 1;
        return { formattedName: `${symbol} AUG 100 CE`, ltp: 1 } satisfies OptionSuggestion;
      },
    });

    assert.ok(
      maxInFlight <= BREAKOUT_OPTION_ENRICH_BATCH_SIZE,
      `expected max concurrent <= ${BREAKOUT_OPTION_ENRICH_BATCH_SIZE}, got ${maxInFlight}`
    );
    // First batch of 2 must start before later symbols if unbounded all-at-once were used
    // we'd still see maxInFlight=6; the order check ensures batching progressed in waves.
    assert.deepEqual(startOrder.slice(0, 2).sort(), ['SYM0', 'SYM1']);
    assert.ok(startOrder.indexOf('SYM4') > startOrder.indexOf('SYM1'));
  });
});

describe('sendBreakoutAlert optionSuggestion rendering', () => {
  async function withTelegramMocks(run: (sentBodies: string[]) => Promise<void>) {
    const originalFetch = global.fetch;
    const originalFindUnique = prisma.appSettings.findUnique;
    const originalToken = env.TELEGRAM_BOT_TOKEN;
    const originalGroupChatId = env.TELEGRAM_GROUP_CHAT_ID;

    env.TELEGRAM_BOT_TOKEN = 'unit-test-token';
    env.TELEGRAM_GROUP_CHAT_ID = 'group-chat';
    prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

    const sentBodies: string[] = [];
    global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { text: string };
      sentBodies.push(body.text);
      return { ok: true, text: async () => '', json: async () => ({ ok: true }) };
    }) as unknown as typeof global.fetch;

    try {
      await run(sentBodies);
    } finally {
      global.fetch = originalFetch;
      prisma.appSettings.findUnique = originalFindUnique;
      env.TELEGRAM_BOT_TOKEN = originalToken;
      env.TELEGRAM_GROUP_CHAT_ID = originalGroupChatId;
    }
  }

  it('includes 🎯 Option line when optionSuggestion is present', async () => {
    await withTelegramMocks(async (sentBodies) => {
      const result = await TelegramService.sendBreakoutAlert([
        {
          ...baseBreakout('RELIANCE'),
          optionSuggestion: {
            formattedName: 'RELIANCE AUG 2500 CE',
            ltp: 42.5,
          },
        },
      ]);
      assert.equal(result.ok, true);
      assert.match(sentBodies[0], /🎯 Option: <b>RELIANCE AUG 2500 CE @ ₹42\.50<\/b>/);
    });
  });

  it('still sends successfully without Option line when suggestion missing or errored', async () => {
    await withTelegramMocks(async (sentBodies) => {
      const result = await TelegramService.sendBreakoutAlert([
        baseBreakout('NOSUGGEST'),
        {
          ...baseBreakout('ERRORED'),
          optionSuggestion: { error: 'EMPTY_CHAIN' },
        },
      ]);
      assert.equal(result.ok, true);
      assert.doesNotMatch(sentBodies[0], /🎯 Option/);
      assert.match(sentBodies[0], /NOSUGGEST/);
      assert.match(sentBodies[0], /ERRORED/);
    });
  });
});
