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

test('sendRawMessage sends pre-formatted message to group or fallback chat', async () => {
  const originalFetch = global.fetch;
  const originalFindUnique = prisma.appSettings.findUnique;
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalGroup = env.TELEGRAM_GROUP_CHAT_ID;

  env.TELEGRAM_BOT_TOKEN = 'raw-test-token';
  env.TELEGRAM_GROUP_CHAT_ID = 'raw-group-chat';
  prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

  let sentBody: string = '';
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    sentBody = String(init?.body);
    return {
      ok: true,
      text: async () => 'ok',
      json: async () => ({ ok: true }),
    };
  }) as unknown as typeof global.fetch;

  try {
    const res = await TelegramService.sendRawMessage('<b>System Alert</b>');
    assert.strictEqual(res.ok, true);
    assert.match(sentBody, /raw-group-chat/);
    assert.match(sentBody, /System Alert/);
  } finally {
    global.fetch = originalFetch;
    prisma.appSettings.findUnique = originalFindUnique;
    env.TELEGRAM_BOT_TOKEN = originalToken;
    env.TELEGRAM_GROUP_CHAT_ID = originalGroup;
  }
});

test('sendMessage returns false when bot token is not configured', async () => {
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalFindUnique = prisma.appSettings.findUnique;
  env.TELEGRAM_BOT_TOKEN = undefined;
  prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

  try {
    const res = await TelegramService.sendMessage('test message');
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'missing_config');
  } finally {
    env.TELEGRAM_BOT_TOKEN = originalToken;
    prisma.appSettings.findUnique = originalFindUnique;
  }
});

test('sendBtstAlert with only SHORT setups displays 0 LONG setups and formats SHORT section', async () => {
  const mocks = withMocks({ group: 'group-chat' });
  try {
    const shortOnlyPayload = [
      {
        tag: 'SHORT',
        longScore: 0,
        shortScore: 115,
        symbol: 'SHORT_TCS',
        entry: 3500,
        sl: 3535,
        target: 3430,
        rr: '1:2',
        signals: ['BEARISH'],
        classification: 'STRONG_STBT',
      },
    ] as unknown as Parameters<typeof TelegramService.sendBtstAlert>[0];

    const result = await TelegramService.sendBtstAlert(shortOnlyPayload);
    assert.strictEqual(result.sent, true);
    assert.match(mocks.sentBodies[0], /🟢 <b>LONG SETUPS \(0\)<\/b>/);
    assert.match(mocks.sentBodies[0], /🔴 <b>SHORT SETUPS \(1\)<\/b>/);
    assert.match(mocks.sentBodies[0], /SHORT_TCS/);
  } finally {
    mocks.restore();
  }
});

test('sendBreakoutAlert edge cases and formatting options', async () => {
  const originalFetch = global.fetch;
  const originalFindUnique = prisma.appSettings.findUnique;
  const originalToken = env.TELEGRAM_BOT_TOKEN;
  const originalGroup = env.TELEGRAM_GROUP_CHAT_ID;

  env.TELEGRAM_BOT_TOKEN = 'token';
  env.TELEGRAM_GROUP_CHAT_ID = 'group';
  prisma.appSettings.findUnique = (async () => null) as unknown as typeof prisma.appSettings.findUnique;

  const sentBodies: string[] = [];
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string };
    sentBodies.push(body.text);
    return { ok: true, text: async () => 'ok', json: async () => ({ ok: true }) };
  }) as unknown as typeof global.fetch;

  try {
    // 1. Empty array
    const emptyRes = await TelegramService.sendBreakoutAlert([]);
    assert.strictEqual(emptyRes.ok, false);
    assert.strictEqual(emptyRes.reason, 'no_breakouts');

    // 2. Missing chatId
    env.TELEGRAM_GROUP_CHAT_ID = undefined;
    env.TELEGRAM_CHAT_ID = undefined;
    const noChatRes = await TelegramService.sendBreakoutAlert([{ symbol: 'T', ltp: 10, entry: 10, sl: 9, target: 11, rr: '1:1', score: 80, sector: 'IT' }]);
    assert.strictEqual(noChatRes.ok, false);
    assert.strictEqual(noChatRes.reason, 'missing_config');

    // Restore group chatId
    env.TELEGRAM_GROUP_CHAT_ID = 'group';

    // 3. target2, optionSuggestion, RANGE and TREND signals
    await TelegramService.sendBreakoutAlert([
      {
        symbol: 'ADV_STOCK',
        ltp: 200,
        entry: 200,
        sl: 195,
        target: 210,
        target2: 220,
        rr: '1:2',
        rr2: '1:4',
        score: 85,
        sector: 'Auto',
        alertKind: 'BREAKOUT',
        signals: ['BREAKOUT', 'RANGE'],
        optionSuggestion: { formattedName: 'ADV 200 CE', ltp: 8.5 },
      },
      {
        symbol: 'TREND_STOCK',
        ltp: 500,
        entry: 500,
        sl: 510,
        target: 480,
        rr: '1:2',
        score: 82,
        sector: 'Bank',
        alertKind: 'BREAKDOWN',
        signals: ['BREAKDOWN', 'TREND'],
      },
    ]);

    const mixedBody = sentBodies[0];
    assert.match(mixedBody, /NEW BREAKOUT \/ BREAKDOWN SIGNALS/);
    assert.match(mixedBody, /Target 2: ₹220\.00/);
    assert.match(mixedBody, /Option: <b>ADV 200 CE @ ₹8\.50<\/b>/);
    assert.match(mixedBody, /RANGE breakout/);
    assert.match(mixedBody, /TREND continuation/);
    assert.match(mixedBody, /at CPR band edge/);

    // 4. Chunking large batch (>3900 chars)
    sentBodies.length = 0;
    const largeBatch = Array.from({ length: 30 }, (_, i) => ({
      symbol: `CHUNK_SYM_${i}`,
      ltp: 1000 + i,
      entry: 1000 + i,
      sl: 990 + i,
      target: 1020 + i,
      target2: 1040 + i,
      rr: '1:2',
      rr2: '1:4',
      score: 80 + (i % 10),
      sector: 'Energy',
      alertKind: 'BREAKOUT' as const,
      signals: ['BREAKOUT'],
      optionSuggestion: { formattedName: `CHUNK ${1000 + i} CE`, ltp: 25 },
    }));

    const chunkRes = await TelegramService.sendBreakoutAlert(largeBatch);
    assert.strictEqual(chunkRes.ok, true);
    assert.ok(sentBodies.length > 1, `Must chunk into multiple messages, got ${sentBodies.length}`);
    for (const body of sentBodies) {
      assert.ok(body.length <= 4096, `Chunk length ${body.length} <= 4096`);
    }
  } finally {
    global.fetch = originalFetch;
    prisma.appSettings.findUnique = originalFindUnique;
    env.TELEGRAM_BOT_TOKEN = originalToken;
    env.TELEGRAM_GROUP_CHAT_ID = originalGroup;
  }
});


