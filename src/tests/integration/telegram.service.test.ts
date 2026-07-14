import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../services/alert/telegram.service';
import { prisma } from '../../lib/db';
import { encrypt } from '../../lib/crypto';

describe('TelegramService', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;
    await prisma.appSettings.deleteMany({});
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await prisma.appSettings.deleteMany({});
  });

  it('decrypts telegramToken before sending breakout alert', async () => {
    const plainToken = 'test-token-12345';
    const encryptedToken = encrypt(plainToken);

    await prisma.appSettings.create({
      data: {
        id: 'global',
        telegramToken: encryptedToken,
        telegramGroupChatId: 'test-chat-id'
      }
    });

    let capturedUrl = '';
    global.fetch = (async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return { ok: true, json: async () => ({ ok: true }) };
    }) as unknown as typeof global.fetch;

    // We pass undefined for overrides to force it to read from DB
    await TelegramService.sendBreakoutAlert([
      { symbol: 'RELIANCE', ltp: 2500, entry: 2490, sl: 2450, target: 2550, rr: '1:1.5', score: 8, sector: 'Energy' }
    ], undefined, undefined);

    assert.ok(capturedUrl.includes(plainToken), 'URL should contain decrypted token');
    assert.ok(!capturedUrl.includes(encryptedToken), 'URL should not contain encrypted token');
  });
});
