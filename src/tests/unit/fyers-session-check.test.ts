import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { checkFyersSession } from '@/services/scheduler/market-cron.scheduler';
import { prisma } from '@/lib/db';
import { FyersAuthService } from '@/services/fyers-auth.service';
import { TelegramService } from '@/services/alert/telegram.service';

describe('checkFyersSession (09:00 AM IST Regression Guard)', () => {
  let origFindUnique: any;
  let origGetAccessToken: any;
  let origSendMessage: any;
  let sentMessages: string[] = [];

  beforeEach(() => {
    origFindUnique = prisma.brokerToken.findUnique;
    origGetAccessToken = FyersAuthService.getAccessToken;
    origSendMessage = TelegramService.sendMessage;
    sentMessages = [];

    TelegramService.sendMessage = async (msg: string) => {
      sentMessages.push(msg);
      return { ok: true };
    };
  });

  afterEach(() => {
    prisma.brokerToken.findUnique = origFindUnique;
    FyersAuthService.getAccessToken = origGetAccessToken;
    TelegramService.sendMessage = origSendMessage;
  });

  it('1. valid token + decrypt success: returns VALID and sends no alert', async () => {
    const future = new Date(Date.now() + 3600_000);
    prisma.brokerToken.findUnique = (async () => ({
      broker: 'fyers',
      accessToken: 'encrypted_valid_token',
      expiresAt: future,
    })) as any;
    FyersAuthService.getAccessToken = async () => 'decrypted_fyers_token_123';

    const res = await checkFyersSession(new Date());
    assert.equal(res.status, 'VALID');
    assert.equal(res.alertSent, false);
    assert.equal(sentMessages.length, 0);
  });

  it('2. expired token: returns EXPIRED and sends session expired alert', async () => {
    const past = new Date(Date.now() - 3600_000);
    prisma.brokerToken.findUnique = (async () => ({
      broker: 'fyers',
      accessToken: 'encrypted_expired_token',
      expiresAt: past,
    })) as any;
    FyersAuthService.getAccessToken = async () => null;

    const res = await checkFyersSession(new Date());
    assert.equal(res.status, 'EXPIRED');
    assert.equal(res.alertSent, true);
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].includes('FYERS SESSION EXPIRED'));
  });

  it('3. missing record: returns MISSING and sends session expired alert', async () => {
    prisma.brokerToken.findUnique = (async () => null) as any;

    const res = await checkFyersSession(new Date());
    assert.equal(res.status, 'MISSING');
    assert.equal(res.alertSent, true);
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].includes('FYERS SESSION EXPIRED'));
  });

  it('4. decrypt failure: returns DECRYPT_FAILED and sends invalid session alert', async () => {
    const future = new Date(Date.now() + 3600_000);
    prisma.brokerToken.findUnique = (async () => ({
      broker: 'fyers',
      accessToken: 'corrupted_token',
      expiresAt: future,
    })) as any;
    // FyersAuthService returns null on decryption error
    FyersAuthService.getAccessToken = async () => null;

    const res = await checkFyersSession(new Date());
    assert.equal(res.status, 'DECRYPT_FAILED');
    assert.equal(res.alertSent, true);
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].includes('FYERS SESSION INVALID'));
    assert.ok(sentMessages[0].includes('could not be decrypted'));
  });

  it('5. database error: returns DB_ERROR and sends distinct non-silent warning alert', async () => {
    prisma.brokerToken.findUnique = (async () => {
      throw new Error('Connection pool exhausted');
    }) as any;

    const res = await checkFyersSession(new Date());
    assert.equal(res.status, 'DB_ERROR');
    assert.equal(res.alertSent, true);
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].includes('FYERS SESSION CHECK ERROR'));
    assert.ok(sentMessages[0].includes('Connection pool exhausted'));
  });
});
