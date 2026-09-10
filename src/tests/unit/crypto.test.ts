import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '@/config/env';
import { encrypt, decrypt, isValidCronSecret, timingSafeStringEqual } from '../../lib/crypto';

describe('crypto utilities (Tier 1 coverage)', () => {
  const originalTokenKey = env.TOKEN_ENCRYPTION_KEY;
  const originalCronSecret = env.CRON_SECRET;

  before(() => {
    (env as any).TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-secret';
    (env as any).CRON_SECRET = 'test-cron-secret-12345';
  });

  after(() => {
    (env as any).TOKEN_ENCRYPTION_KEY = originalTokenKey;
    (env as any).CRON_SECRET = originalCronSecret;
  });

  describe('encrypt and decrypt', () => {
    it('encrypts and successfully decrypts a UTF-8 string', () => {
      const plaintext = 'SuperSecretToken_12345!@#$%^&*()';
      const ciphertext = encrypt(plaintext);

      assert.notEqual(ciphertext, plaintext);
      const parts = ciphertext.split(':');
      assert.equal(parts.length, 3, 'Ciphertext must follow format iv:encryptedText:authTag');

      const decrypted = decrypt(ciphertext);
      assert.equal(decrypted, plaintext);
    });

    it('throws error when TOKEN_ENCRYPTION_KEY is unset', () => {
      (env as any).TOKEN_ENCRYPTION_KEY = undefined;
      assert.throws(() => encrypt('test'), /TOKEN_ENCRYPTION_KEY environment variable is missing/);
      (env as any).TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key-secret';
    });

    it('throws error when decrypting invalid ciphertext format', () => {
      assert.throws(() => decrypt('invalid-format'), /Invalid ciphertext format/);
      assert.throws(() => decrypt('part1:part2'), /Invalid ciphertext format/);
    });

    it('throws error when authTag or ciphertext is tampered with', () => {
      const ciphertext = encrypt('tamper-test');
      const parts = ciphertext.split(':');
      // Alter the encrypted text
      const tamperedParts = [parts[0], parts[1].slice(0, -2) + '00', parts[2]];
      assert.throws(() => decrypt(tamperedParts.join(':')));
    });
  });

  describe('isValidCronSecret', () => {
    it('returns true for matching cron secret', () => {
      assert.equal(isValidCronSecret('test-cron-secret-12345'), true);
    });

    it('returns false for mismatched cron secret or length mismatch', () => {
      assert.equal(isValidCronSecret('wrong-secret'), false);
      assert.equal(isValidCronSecret('test-cron-secret-1234'), false);
      assert.equal(isValidCronSecret('test-cron-secret-123456'), false);
    });

    it('returns false for null or empty header', () => {
      assert.equal(isValidCronSecret(null), false);
      assert.equal(isValidCronSecret(''), false);
    });

    it('returns false when env.CRON_SECRET is undefined', () => {
      (env as any).CRON_SECRET = undefined;
      assert.equal(isValidCronSecret('test-cron-secret-12345'), false);
      (env as any).CRON_SECRET = 'test-cron-secret-12345';
    });
  });

  describe('timingSafeStringEqual', () => {
    it('returns true for equal strings', () => {
      assert.equal(timingSafeStringEqual('abc123xyz', 'abc123xyz'), true);
      assert.equal(timingSafeStringEqual('', ''), true);
    });

    it('returns false for unequal strings of same length', () => {
      assert.equal(timingSafeStringEqual('abc123xyz', 'abc123xyw'), false);
    });

    it('returns false for strings of different length', () => {
      assert.equal(timingSafeStringEqual('short', 'longer-string'), false);
    });

    it('returns false for non-string types', () => {
      assert.equal(timingSafeStringEqual(null as unknown as string, 'test'), false);
      assert.equal(timingSafeStringEqual('test', undefined as unknown as string), false);
    });
  });
});
