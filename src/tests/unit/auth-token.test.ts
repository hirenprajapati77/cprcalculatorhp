import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual, hashToken } from '../../lib/auth-token';

describe('auth-token timingSafeEqual and hashToken', () => {
  it('returns true for identical tokens', () => {
    assert.equal(timingSafeEqual('secret-token-12345', 'secret-token-12345'), true);
    assert.equal(timingSafeEqual('', ''), true);
  });

  it('returns false for tokens of different lengths', () => {
    assert.equal(timingSafeEqual('secret', 'secret1'), false);
    assert.equal(timingSafeEqual('secret1', 'secret'), false);
    assert.equal(timingSafeEqual('short', 'much-longer-token-string-here'), false);
  });

  it('returns false for tokens of same length but differing characters', () => {
    assert.equal(timingSafeEqual('secretA', 'secretB'), false);
    assert.equal(timingSafeEqual('1234567', '1234568'), false);
  });

  it('returns false when inputs are not strings', () => {
    assert.equal(timingSafeEqual(null as any, 'secret'), false);
    assert.equal(timingSafeEqual('secret', undefined as any), false);
    assert.equal(timingSafeEqual(123 as any, 123 as any), false);
  });

  it('correctly compares strings with special characters and unicode', () => {
    assert.equal(timingSafeEqual('token!@#$%^&*()_+', 'token!@#$%^&*()_+'), true);
    assert.equal(timingSafeEqual('token!@#$%^&*()_+', 'token!@#$%^&*()_-'), false);
    assert.equal(timingSafeEqual('🚀-trading-token', '🚀-trading-token'), true);
    assert.equal(timingSafeEqual('🚀-trading-token', '💰-trading-token'), false);
  });

  it('hashes tokens deterministically with SHA-256 hex output', async () => {
    const hash1 = await hashToken('test-app-token');
    const hash2 = await hashToken('test-app-token');
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
    assert.match(hash1, /^[0-9a-f]{64}$/);
  });
});
