import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

describe('Middleware Authentication & Gating', () => {

  it('redirects anonymous visits to /scanner to /unlock', () => {
    const req = new NextRequest('http://localhost:3000/scanner', {
      headers: { host: 'localhost:3000' }
    });
    const res = middleware(req);
    assert.ok(res);
    assert.strictEqual(res.status, 307);
    assert.strictEqual(res.headers.get('location'), 'http://localhost:3000/unlock');
  });

  it('allows anonymous visits to public pages', () => {
    const publicPaths = ['/unlock', '/about', '/faq', '/share/12345'];
    for (const path of publicPaths) {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = middleware(req);
      assert.ok(res);
      assert.strictEqual(res.headers.get('x-middleware-next'), '1');
    }
  });

  it('does not Set-Cookie app_access_token on anonymous page visits', () => {
    const req = new NextRequest('http://localhost:3000/scanner');
    const res = middleware(req);
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(!setCookie.includes('app_access_token'));
  });

  it('blocks unauthenticated API requests with 401', () => {
    const req = new NextRequest('http://localhost:3000/api/settings');
    const res = middleware(req);
    assert.ok(res);
    assert.strictEqual(res.status, 401);
  });

  it('allows API requests with valid authorization header', () => {
    const req = new NextRequest('http://localhost:3000/api/settings', {
      headers: {
        authorization: 'Bearer test-token-123'
      }
    });
    const res = middleware(req);
    assert.ok(res);
    assert.strictEqual(res.headers.get('x-middleware-next'), '1');
  });

  it('allows API requests with valid cookie', () => {
    const req = new NextRequest('http://localhost:3000/api/settings', {
      headers: {
        cookie: 'app_access_token=test-token-123'
      }
    });
    const res = middleware(req);
    assert.ok(res);
    assert.strictEqual(res.headers.get('x-middleware-next'), '1');
  });

  it('exempts public and cron API routes from token checks', () => {
    const exemptPaths = [
      '/api/health',
      '/api/broker/fyers/callback',
      '/api/broker/fyers/login',
      '/api/share/123',
      '/api/auth/unlock',
      '/api/auth/logout',
      '/api/cron/auto-scan'
    ];
    for (const path of exemptPaths) {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = middleware(req);
      assert.ok(res);
      assert.strictEqual(res.headers.get('x-middleware-next'), '1');
    }
  });
});
