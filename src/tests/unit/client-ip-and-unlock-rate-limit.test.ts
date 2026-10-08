import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { resolveClientIp } from '../../lib/client-ip';
import { checkUnlockRateLimit } from '../../lib/unlock-rate-limit';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/auth/unlock', {
    method: 'POST',
    headers: new Headers(headers),
  });
  return req;
}

describe('resolveClientIp', () => {
  it('prefers x-real-ip when present', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.50',
      'x-forwarded-for': '198.51.100.1, 198.51.100.2',
    });
    const ip = resolveClientIp(headers, true);
    assert.strictEqual(ip, '203.0.113.50');
  });

  it('trims whitespace from x-real-ip', () => {
    const headers = new Headers({
      'x-real-ip': '  203.0.113.50  ',
    });
    const ip = resolveClientIp(headers, false);
    assert.strictEqual(ip, '203.0.113.50');
  });

  it('extracts last hop of x-forwarded-for when trustProxy is true', () => {
    const headers = new Headers({
      'x-forwarded-for': '10.0.0.1, 172.16.0.2, 198.51.100.99',
    });
    const ip = resolveClientIp(headers, true);
    assert.strictEqual(ip, '198.51.100.99');
  });

  it('ignores x-forwarded-for when trustProxy is false', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.99',
    });
    const ip = resolveClientIp(headers, false);
    assert.strictEqual(ip, null);
  });

  it('returns null when headers are empty', () => {
    const headers = new Headers({});
    const ip = resolveClientIp(headers, true);
    assert.strictEqual(ip, null);
  });
});

describe('checkUnlockRateLimit — fail-closed IP resolution', () => {
  it('fails closed in production with Redis configured when IP cannot be resolved', async () => {
    const req = makeRequest(); // no x-real-ip, no x-forwarded-for
    const result = await checkUnlockRateLimit(req, {
      isProduction: true,
      redisConfigured: true,
      isRedisUp: true,
      trustProxy: true,
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.unavailable, true);
  });

  it('fails closed in production when Redis is down', async () => {
    const req = makeRequest({ 'x-real-ip': '203.0.113.4' });
    const result = await checkUnlockRateLimit(req, {
      isProduction: true,
      redisConfigured: true,
      isRedisUp: false,
      trustProxy: true,
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.unavailable, true);
  });

  it('permits requests in development when IP is absent by falling back to loopback', async () => {
    const req = makeRequest(); // no headers
    const result = await checkUnlockRateLimit(req, {
      isProduction: false,
      redisConfigured: false,
      isRedisUp: false,
      trustProxy: false,
    });

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.unavailable, undefined);
  });

  it('allows request when valid client IP is provided and rate limit is not exceeded', async () => {
    const req = makeRequest({ 'x-real-ip': '198.51.100.77' });
    const result = await checkUnlockRateLimit(req, {
      isProduction: false,
      redisConfigured: false,
      isRedisUp: false,
      trustProxy: false,
    });

    assert.strictEqual(result.allowed, true);
  });
});
