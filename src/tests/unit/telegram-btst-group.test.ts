import test from 'node:test';
import assert from 'node:assert';
import { env } from '../../config/env';
import { prisma } from '../../lib/db';
import { TelegramService } from '../../services/alert/telegram.service';

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
  global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { chat_id: string };
    sentChatIds.push(body.chat_id);
    const behavior = opts.fetchBehavior?.(body.chat_id) ?? { ok: true };
    return {
      ok: behavior.ok,
      text: async () => 'telegram error body',
      json: async () => ({ ok: behavior.ok }),
    };
  }) as unknown as typeof global.fetch;

  return {
    sentChatIds,
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
    } finally {
      mocks.restore();
    }
  });
});
