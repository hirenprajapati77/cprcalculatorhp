import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as unlock } from '../../app/api/auth/unlock/route';
import { POST as logout } from '../../app/api/auth/logout/route';
import { cache } from '../../lib/redis';

function unlockReq(body: unknown, url = 'http://localhost:3000/api/auth/unlock') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/unlock', () => {
  beforeEach(async () => {
    await cache.clear();
  });
  it('sets HttpOnly cookie when token matches APP_ACCESS_TOKEN', async () => {
    const res = await unlock(unlockReq({ token: 'test-token-123' }));
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.match(setCookie, /app_access_token=test-token-123/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=strict/i);
    assert.ok(!/Secure/i.test(setCookie), 'Secure must be off on http://localhost');
  });

  it('rejects wrong token with 401 and no cookie', async () => {
    const res = await unlock(unlockReq({ token: 'wrong-token' }));
    assert.strictEqual(res.status, 401);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(!setCookie.includes('app_access_token=test-token-123'));
  });

  it('rejects non-string token without throwing', async () => {
    const res = await unlock(unlockReq({ token: 12345 }));
    assert.strictEqual(res.status, 401);
  });

  it('sets Secure when request is https', async () => {
    const res = await unlock(
      unlockReq({ token: 'test-token-123' }, 'https://example.com/api/auth/unlock')
    );
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.match(setCookie, /Secure/i);
  });

  it('rate limits after 5 attempts', async () => {
    // 5 allowed attempts
    for (let i = 0; i < 5; i++) {
      const res = await unlock(unlockReq({ token: 'wrong-token' }));
      assert.strictEqual(res.status, 401);
    }
    // 6th attempt should return 429
    const res = await unlock(unlockReq({ token: 'wrong-token' }));
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.headers.get('retry-after'), '900');
    const data = await res.json();
    assert.strictEqual(data.error, 'Too many requests. Please try again later.');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the access cookie', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' });
    const res = await logout(req);
    assert.strictEqual(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.match(setCookie, /app_access_token=/);
    assert.match(setCookie, /Max-Age=0/i);
  });
});
