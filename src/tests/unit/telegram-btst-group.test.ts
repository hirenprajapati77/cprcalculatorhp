import test from 'node:test';
import assert from 'node:assert';
import { env } from '../../config/env';
import { prisma } from '../../lib/db';
import { TelegramService, escapeTelegramHtml } from '../../services/alert/telegram.service';

test('escapeTelegramHtml', () => {
  assert.strictEqual(escapeTelegramHtml('L&T <CE>'), 'L&amp;T &lt;CE&gt;');
  assert.strictEqual(escapeTelegramHtml('score < 85'), 'score &lt; 85');
});

/** Minimal qualifying LONG payload (STRONG_ classification forces the send path). */
function makeAlertPayload() {
  return [
    {
      tag: 'LONG',
      longScore: 120,
      shortScore: 0,
      symbol: 'TEST',
      entry: 100,
      sl: 98,
      target: 104,
      rr: '1:2',
      signals: ['BULLISH'],
      classification: 'STRONG_BTST',
    },
  ] as unknown as Parameters<typeof TelegramService.sendBtstAlert>[0];
}

/** Empty payload → the "no qualifying setups" status message path. */
function makeEmptyPayload() {
  return [] as unknown as Parameters<typeof TelegramService.sendBtstAlert>[0];
}

type FetchBehavior = (chatId: string) => { ok: boolean };

function withMocks(opts: {
  personal?: string;
  group?: string;
  fetchBehavior?: FetchBehavior;
}) {
  const originalFetch = global.fetch;
  const originalFindUnique = prisma.appSettings.findUnique;
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalChatId = env.TELEGRAM_CHAT_ID;
  const originalGroupChatId = env.TELEGRAM_GROUP_CHAT_ID;

  env.TELEGRAM_BOT_TOKEN = 'unit-test-token';
  env.TELEGRAM_CHAT_ID = opts.personal;
  env.TELEGRAM_GROUP_CHAT_ID = opts.group;

  // No AppSettings fallback in these tests — env is the source of truth.
  prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

  const sentChatIds: string[] = [];
  const sentBodies: string[] = [];
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { chat_id: string; text: string };
    sentChatIds.push(body.chat_id);
    sentBodies.push(body.text);
    const behavior = opts.fetchBehavior?.(body.chat_id) ?? { ok: true };
    return {
      ok: behavior.ok,
      text: async () => 'telegram error body',
      json: async () => ({ ok: behavior.ok }),
    };
  }) as unknown as typeof global.fetch;

  return {
    sentChatIds,
    sentBodies,
    restore: () => {
      global.fetch = originalFetch;
      prisma.appSettings.findUnique = originalFindUnique;
      env.TELEGRAM_BOT_TOKEN = originalToken;
      env.TELEGRAM_CHAT_ID = originalChatId;
      env.TELEGRAM_GROUP_CHAT_ID = originalGroupChatId;
    },
  };
}

test('sendBtstAlert group-only delivery', async (t) => {
  await t.test('sends only to the group chat, never to the personal DM', async () => {
    const mocks = withMocks({ personal: 'dm-chat', group: 'group-chat' });
    try {
      const result = await TelegramService.sendBtstAlert(makeAlertPayload());
      assert.strictEqual(result.sent, true);
      assert.deepStrictEqual(mocks.sentChatIds, ['group-chat'], 'group is the single destination');
    } finally {
      mocks.restore();
    }
  });

  await t.test('falls back to the personal chat only when no group is configured', async () => {
    const mocks = withMocks({ personal: 'dm-chat' });
    try {
      const result = await TelegramService.sendBtstAlert(makeAlertPayload());
      assert.strictEqual(result.sent, true);
      assert.deepStrictEqual(mocks.sentChatIds, ['dm-chat'], 'alert must not be dropped without a group');
    } finally {
      mocks.restore();
    }
  });

  await t.test('group send failure returns sent=false so claims roll back and retry', async () => {
    const mocks = withMocks({
      personal: 'dm-chat',
      group: 'group-chat',
      fetchBehavior: () => ({ ok: false }),
    });
    try {
      const result = await TelegramService.sendBtstAlert(makeAlertPayload());
      assert.strictEqual(result.sent, false);
      assert.ok(result.reason?.includes('telegram_api_error'), `reason should surface the API error, got: ${result.reason}`);
      assert.deepStrictEqual(mocks.sentChatIds, ['group-chat'], 'no silent fallback to DM when the group is configured');
    } finally {
      mocks.restore();
    }
  });

  await t.test('"no qualifying setups" status message also goes to the group', async () => {
    const mocks = withMocks({ personal: 'dm-chat', group: 'group-chat' });
    try {
      const result = await TelegramService.sendBtstAlert(makeEmptyPayload());
      assert.strictEqual(result.sent, true);
      assert.strictEqual(result.reason, 'no setups');
      assert.deepStrictEqual(mocks.sentChatIds, ['group-chat']);
      assert.match(mocks.sentBodies[0], /score &lt; \d+/);
      assert.doesNotMatch(mocks.sentBodies[0], /score < \d+/);
    } finally {
      mocks.restore();
    }
  });

  await t.test('escapes HTML in symbol and option fields', async () => {
    const mocks = withMocks({ personal: 'dm-chat', group: 'group-chat' });
    try {
      const payload = [
        {
          tag: 'LONG',
          longScore: 120,
          shortScore: 0,
          symbol: 'L&T',
          entry: 100,
          sl: 98,
          target: 104,
          rr: '1:2',
          signals: ['BULLISH'],
          classification: 'STRONG_BTST',
          optionSuggestion: { formattedName: 'AUG 2026 <100> CE', ltp: 10 },
        },
      ] as unknown as Parameters<typeof TelegramService.sendBtstAlert>[0];
      const result = await TelegramService.sendBtstAlert(payload);
      assert.strictEqual(result.sent, true);
      const body = mocks.sentBodies[0];
      assert.match(body, /L&amp;T/);
      assert.match(body, /AUG 2026 &lt;100&gt; CE/);
      assert.doesNotMatch(body, /<100>/);
    } finally {
      mocks.restore();
    }
  });

  await t.test('chunks large BTST payloads exceeding 3900 characters into multiple messages', async () => {
    const mocks = withMocks({ group: 'group-chat' });
    try {
      // Create 35 setups — will easily exceed 3900 chars
      const largePayload = Array.from({ length: 35 }, (_, i) => ({
        tag: i % 2 === 0 ? 'LONG' : 'SHORT',
        longScore: i % 2 === 0 ? 110 : 0,
        shortScore: i % 2 === 0 ? 0 : 110,
        symbol: `STOCK${i}`,
        entry: 500 + i,
        sl: 490 + i,
        target: 520 + i,
        rr: '1:2',
        signals: ['BULLISH', 'VOLUME_SPIKE', 'CPR_ABOVE_TC'],
        classification: i % 2 === 0 ? 'STRONG_BTST' : 'STRONG_STBT',
        optionSuggestion: { formattedName: `SEP 2026 500 CE`, ltp: 15 },
      })) as unknown as Parameters<typeof TelegramService.sendBtstAlert>[0];

      const result = await TelegramService.sendBtstAlert(largePayload);
      assert.strictEqual(result.sent, true);
      assert.ok(mocks.sentBodies.length > 1, `Must split into multiple messages, got ${mocks.sentBodies.length}`);
      for (const body of mocks.sentBodies) {
        assert.ok(body.length <= 4096, `Message length ${body.length} must not exceed Telegram 4096 cap`);
      }
    } finally {
      mocks.restore();
    }
  });
});

test('sendBreakoutAlert escapes HTML in footnote', async () => {
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
    const result = await TelegramService.sendBreakoutAlert([
      {
        symbol: 'TEST',
        ltp: 100,
        entry: 101,
        sl: 99,
        target: 103,
        rr: '1:1.5',
        score: 80,
        sector: 'IT',
        alertKind: 'BREAKDOWN',
        signals: ['BREAKDOWN'],
      },
    ]);
    assert.strictEqual(result.ok, true);
    assert.match(sentBodies[0], /Price &lt; BC/);
    assert.doesNotMatch(sentBodies[0], /Price < BC/);
  } finally {
    global.fetch = originalFetch;
    prisma.appSettings.findUnique = originalFindUnique;
    env.TELEGRAM_BOT_TOKEN = originalToken;
    env.TELEGRAM_GROUP_CHAT_ID = originalGroupChatId;
  }
});

test('sendBreakoutAlert uses dynamic CPR classification and conditionally includes Volume Spike', async () => {
  const originalFetch = global.fetch;
  const originalFindUnique = prisma.appSettings.findUnique;
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalGroupChatId = env.TELEGRAM_GROUP_CHAT_ID;

  env.TELEGRAM_BOT_TOKEN = 'unit-test-token';
  env.TELEGRAM_GROUP_CHAT_ID = 'group-chat';
  prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

  let sentBody = '';
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string };
    sentBody = body.text;
    return { ok: true, text: async () => '', json: async () => ({ ok: true }) };
  }) as unknown as typeof global.fetch;

  try {
    const baseStock = {
      ltp: 100, entry: 101, sl: 99, target: 103, rr: '1:1.5', score: 80, sector: 'IT', alertKind: 'BREAKDOWN' as const,
    };

    // 1. NORMAL width
    await TelegramService.sendBreakoutAlert([{ ...baseStock, symbol: 'NORMAL_STK', classification: 'NORMAL', signals: ['BREAKDOWN'] }]);
    assert.match(sentBody, /NORMAL CPR/);
    assert.doesNotMatch(sentBody, /NARROW CPR/);
    assert.doesNotMatch(sentBody, /Volume Spike/); // No VOLUME_SPIKE signal

    // 2. WIDE width + Volume Spike
    await TelegramService.sendBreakoutAlert([{ ...baseStock, symbol: 'WIDE_STK', classification: 'WIDE', signals: ['BREAKDOWN', 'VOLUME_SPIKE'] }]);
    assert.match(sentBody, /WIDE CPR \+ Volume Spike/);
    assert.doesNotMatch(sentBody, /NARROW CPR/);

    // 3. NARROW width + Volume Spike (byte-for-byte regression guard)
    await TelegramService.sendBreakoutAlert([{ ...baseStock, symbol: 'NARROW_STK', classification: 'NARROW', signals: ['BREAKDOWN', 'VOLUME_SPIKE'] }]);
    assert.match(sentBody, /NARROW CPR \+ Volume Spike \+ Price &lt; BC\. Verify before trading\./);
  } finally {
    global.fetch = originalFetch;
    prisma.appSettings.findUnique = originalFindUnique;
    env.TELEGRAM_BOT_TOKEN = originalToken;
    env.TELEGRAM_GROUP_CHAT_ID = originalGroupChatId;
  }
});

test('sendBreakoutAlert returns ok: false when Telegram API returns failure (CRITICAL-06)', async () => {
  const originalFetch = global.fetch;
  const originalFindUnique = prisma.appSettings.findUnique;
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalGroupChatId = env.TELEGRAM_GROUP_CHAT_ID;

  env.TELEGRAM_BOT_TOKEN = 'unit-test-token';
  env.TELEGRAM_GROUP_CHAT_ID = 'group-chat';
  prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

  // Simulate Telegram failure
  global.fetch = (async () => ({
    ok: false,
    text: async () => 'Bad Request: chat not found',
    json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
  })) as unknown as typeof global.fetch;

  try {
    const stock = {
      ltp: 100, entry: 101, sl: 99, target: 103, rr: '1:1.5', score: 80, sector: 'IT', alertKind: 'BREAKOUT' as const, symbol: 'TEST_FAIL', classification: 'NORMAL', signals: ['BREAKOUT'],
    };

    const res = await TelegramService.sendBreakoutAlert([stock]);
    assert.strictEqual(res.ok, false, 'sendBreakoutAlert must return ok: false when telegram fails');
  } finally {
    global.fetch = originalFetch;
    prisma.appSettings.findUnique = originalFindUnique;
    env.TELEGRAM_BOT_TOKEN = originalToken;
    env.TELEGRAM_GROUP_CHAT_ID = originalGroupChatId;
  }
});
