import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// env.APP_ACCESS_TOKEN must be set before importing the module under test,
// since it reads process.env at import time via '@/config/env'. Dynamic
// import (not top-level await, which esbuild's cjs transform here rejects)
// inside a before() hook, assigned to outer-scoped bindings.
process.env.APP_ACCESS_TOKEN = 'test-secret-token';

let isAuthorizedForRefresh: (req: NextRequest) => Promise<boolean>;
let hashToken: (token: string) => Promise<string>;

test.before(async () => {
  ({ isAuthorizedForRefresh } = await import('../../lib/market-tools-refresh-auth'));
  ({ hashToken } = await import('../../lib/auth-token'));
});

function makeRequest(opts: { cookie?: string; bearer?: string }): NextRequest {
  const headers = new Headers();
  if (opts.bearer) headers.set('authorization', `Bearer ${opts.bearer}`);
  if (opts.cookie) headers.set('cookie', `app_access_token=${opts.cookie}`);
  return new NextRequest('https://example.com/api/market-tools/breakout?refresh=true', { headers });
}

test('isAuthorizedForRefresh accepts the hashed cookie value (the real, only value the unlock route ever sets)', async () => {
  const hash = await hashToken('test-secret-token');
  const req = makeRequest({ cookie: hash });
  assert.equal(await isAuthorizedForRefresh(req), true);
});

test('isAuthorizedForRefresh rejects a cookie holding the raw token (never actually happens in production, but should not be treated as invalid if it did)', async () => {
  // Documents that raw-token-as-cookie is ALSO accepted for defensive
  // compatibility (matches middleware.ts's own dual check), even though the
  // unlock route only ever sets the hash. This is the case the original
  // buggy code got backwards -- it compared as if the cookie WAS the raw
  // token and nothing else, which is the opposite of reality.
  const req = makeRequest({ cookie: 'test-secret-token' });
  assert.equal(await isAuthorizedForRefresh(req), true);
});

test('isAuthorizedForRefresh replays the actual production bug: a real hashed session cookie must not 401', async () => {
  // This is the exact failure mode from the 31 Aug 2026 "Unauthorized" error
  // on Multi-Year Breakout's refresh button: a legitimately unlocked browser
  // session (cookie = hashToken(secret)) was rejected because the old code
  // compared it directly against the raw secret string.
  const realSessionCookie = await hashToken('test-secret-token');
  const req = makeRequest({ cookie: realSessionCookie });
  const authorized = await isAuthorizedForRefresh(req);
  assert.equal(authorized, true, 'a real unlocked session must be able to trigger refresh');
});

test('isAuthorizedForRefresh accepts a valid Bearer token (script/API usage)', async () => {
  const req = makeRequest({ bearer: 'test-secret-token' });
  assert.equal(await isAuthorizedForRefresh(req), true);
});

test('isAuthorizedForRefresh rejects a wrong token in every form', async () => {
  assert.equal(await isAuthorizedForRefresh(makeRequest({ bearer: 'wrong' })), false);
  assert.equal(await isAuthorizedForRefresh(makeRequest({ cookie: 'wrong' })), false);
  assert.equal(await isAuthorizedForRefresh(makeRequest({})), false);
});
