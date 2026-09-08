import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startE2EServer, E2ETestServer, TEST_ACCESS_TOKEN, TEST_CRON_SECRET } from './harness';

describe('ISSUE-010: Additional E2E Security Scenarios & Boundary Hardening', () => {
  let server: E2ETestServer;

  before(async () => {
    server = await startE2EServer();
  });

  after(async () => {
    if (server) {
      await server.stop();
    }
  });

  // Scenario 11: Static Asset Extension Spoofing Resistance on API Routes
  describe('Scenario 11: API extension spoofing resistance', () => {
    it('rejects unauthenticated /api/scanner.png with HTTP 401 Unauthorized', async () => {
      const res = await fetch(`${server.baseUrl}/api/scanner.png`);
      assert.strictEqual(res.status, 401, 'Fake static extension on protected API must return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('rejects unauthenticated /api/scanner.ico with HTTP 401 Unauthorized', async () => {
      const res = await fetch(`${server.baseUrl}/api/scanner.ico`);
      assert.strictEqual(res.status, 401, 'Fake static extension on protected API must return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('rejects unauthenticated /api/scanner.js with HTTP 401 Unauthorized', async () => {
      // Even if spoofing a .js extension, static asset exemption does not apply to /api/
      const res = await fetch(`${server.baseUrl}/api/scanner.js`);
      assert.strictEqual(res.status, 401, 'Fake static extension on protected API must return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });
  });

  // Scenario 12: Path Trailing Slash & Normalization Defense
  describe('Scenario 12: Path trailing slash & normalization defense', () => {
    it('redirects unauthenticated duplicate slash root // securely', async () => {
      const res = await fetch(`${server.baseUrl}//`, { redirect: 'manual' });
      assert.ok(
        res.status === 307 || res.status === 308,
        `Expected 307 or 308, got ${res.status}`
      );
      const location = res.headers.get('location') || '';
      assert.ok(
        location.includes('/unlock') || location === '/' || location.endsWith('/'),
        `Unexpected location: ${location}`
      );
    });

    it('redirects unauthenticated multi-slash /// securely', async () => {
      const res = await fetch(`${server.baseUrl}///`, { redirect: 'manual' });
      assert.ok(
        res.status === 307 || res.status === 308,
        `Expected 307 or 308, got ${res.status}`
      );
      const location = res.headers.get('location') || '';
      assert.ok(
        location.includes('/unlock') || location === '/' || location.endsWith('/'),
        `Unexpected location: ${location}`
      );
    });

    it('rejects unauthenticated duplicate slash API path /api//scanner with HTTP 401', async () => {
      const res = await fetch(`${server.baseUrl}/api//scanner`);
      assert.strictEqual(res.status, 401);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('renders /unlock/ with trailing slash with HTTP 200 without redirect loop', async () => {
      const res = await fetch(`${server.baseUrl}/unlock/`, { redirect: 'manual' });
      // Next.js normalizes or renders trailing slash with 200 (or 308 permanent redirect to canonical /unlock)
      assert.ok(
        res.status === 200 || res.status === 308,
        `Expected 200 or 308, got ${res.status}`
      );
    });
  });

  // Scenario 13: Full Authentication Lifecycle (Unlock -> Access -> Logout -> Block)
  describe('Scenario 13: Full authentication & session lifecycle', () => {
    it('executes unlock, gains access, logs out, and confirms revocation', async () => {
      // Step 1: Root without credentials redirects to /unlock
      const unauthRes = await fetch(`${server.baseUrl}/`, { redirect: 'manual' });
      assert.strictEqual(unauthRes.status, 307);

      // Step 2: POST /api/auth/unlock with valid token
      const unlockRes = await fetch(`${server.baseUrl}/api/auth/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TEST_ACCESS_TOKEN }),
      });
      assert.strictEqual(unlockRes.status, 200);
      const unlockJson = await unlockRes.json() as Record<string, unknown>;
      assert.strictEqual(unlockJson.success, true);

      // Extract set-cookie header
      const setCookie = unlockRes.headers.get('set-cookie');
      assert.ok(setCookie, 'Expected Set-Cookie header on successful unlock');
      assert.ok(setCookie.includes('app_access_token='), 'Expected app_access_token in Set-Cookie');

      // Extract cookie value for subsequent requests
      const cookieMatch = setCookie.match(/app_access_token=([^;]+)/);
      assert.ok(cookieMatch, 'Failed to extract cookie value');
      const sessionCookie = `app_access_token=${cookieMatch[1]}`;

      // Step 3: Access protected page with session cookie
      const authPageRes = await fetch(`${server.baseUrl}/`, {
        redirect: 'manual',
        headers: { cookie: sessionCookie },
      });
      const authPageLoc = authPageRes.headers.get('location') || '';
      assert.ok(
        !authPageLoc.includes('/unlock'),
        `Authenticated request must not redirect to /unlock, got ${authPageLoc}`
      );

      // Step 4: POST /api/auth/logout
      const logoutRes = await fetch(`${server.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie: sessionCookie },
      });
      assert.strictEqual(logoutRes.status, 200);
      const logoutCookie = logoutRes.headers.get('set-cookie') || '';
      assert.ok(
        logoutCookie.includes('Max-Age=0') || logoutCookie.includes('expires='),
        `Expected Max-Age=0 or expires in logout Set-Cookie, got ${logoutCookie}`
      );

      // Step 5: Verify that using the cleared cookie (or empty value) now blocks
      const postLogoutRes = await fetch(`${server.baseUrl}/`, {
        redirect: 'manual',
        headers: { cookie: 'app_access_token=' },
      });
      assert.strictEqual(postLogoutRes.status, 307);
      const postLogoutLoc = postLogoutRes.headers.get('location') || '';
      assert.ok(postLogoutLoc.includes('/unlock'));
    });
  });

  // Scenario 14: Authentication Brute Force & Rate Limiting Enforcement
  describe('Scenario 14: Authentication rate limiting enforcement & error response', () => {
    it('enforces rate limiting on repeated invalid unlock attempts without breaking other routes', async () => {
      let hit429 = false;
      let retryAfterHeader: string | null = null;

      // Limit is 5 per 15 minutes for unlock route; sending 7 invalid attempts
      for (let i = 0; i < 7; i++) {
        const res = await fetch(`${server.baseUrl}/api/auth/unlock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Dedicated IP bucket to isolate from any subsequent tests
            'x-real-ip': '192.168.100.99',
          },
          body: JSON.stringify({ token: 'wrong-guess-token' }),
        });

        if (res.status === 429) {
          hit429 = true;
          retryAfterHeader = res.headers.get('retry-after');
          const body = await res.json() as Record<string, unknown>;
          assert.ok(
            typeof body.error === 'string' && body.error.toLowerCase().includes('too many requests'),
            `Expected rate limit error message, got ${JSON.stringify(body)}`
          );
          break;
        } else {
          assert.strictEqual(res.status, 401, `Attempt ${i + 1} expected 401 or 429, got ${res.status}`);
        }
      }

      assert.ok(hit429, 'Expected rate limiter to trigger HTTP 429 on repeated invalid attempts');
      assert.ok(retryAfterHeader, 'Expected Retry-After header on 429 response');

      // CRITICAL ISOLATION CHECK: Unrelated routes must remain fully operational
      const healthRes = await fetch(`${server.baseUrl}/api/health`);
      assert.ok(healthRes.status === 200 || healthRes.status === 503);
    });
  });

  // Scenario 15: Cron Secret Route Boundaries
  describe('Scenario 15: Cron secret protected route boundaries', () => {
    it('rejects /api/cron/reset-breakout-state without x-cron-secret header with 401', async () => {
      const res = await fetch(`${server.baseUrl}/api/cron/reset-breakout-state`);
      assert.strictEqual(res.status, 401);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('rejects /api/cron/reset-breakout-state with invalid x-cron-secret header with 401', async () => {
      const res = await fetch(`${server.baseUrl}/api/cron/reset-breakout-state`, {
        headers: { 'x-cron-secret': 'invalid-bogus-secret-123' },
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('passes authentication boundary with valid x-cron-secret header (not 401/403)', async () => {
      const res = await fetch(`${server.baseUrl}/api/cron/reset-breakout-state`, {
        headers: { 'x-cron-secret': TEST_CRON_SECRET },
      });
      // Boundary-only assertion: authentication must succeed; status must NOT be 401 or 403
      assert.notStrictEqual(res.status, 401, 'Valid cron secret must pass auth boundary');
      assert.notStrictEqual(res.status, 403, 'Valid cron secret must pass auth boundary');
    });
  });

  // Scenario 16: Broker OAuth Route Protection & CSRF Defense
  describe('Scenario 16: Broker OAuth route protection & CSRF defense', () => {
    it('/api/broker/fyers/login is protected and rejects unauthenticated callers with 401', async () => {
      const res = await fetch(`${server.baseUrl}/api/broker/fyers/login`, { redirect: 'manual' });
      assert.strictEqual(res.status, 401, 'Unauthenticated users must NOT be allowed to initiate OAuth login');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('/api/broker/fyers/callback rejects missing or mismatched CSRF state with an error redirect', async () => {
      // Missing or forged state parameter
      const res = await fetch(`${server.baseUrl}/api/broker/fyers/callback?code=sample-code-123&state=unmatched-state`, {
        redirect: 'manual',
      });
      // Handler must redirect with error (status 307 or 302 or 308) indicating CSRF rejection
      assert.ok(
        res.status >= 300 && res.status < 400,
        `Expected redirect on invalid CSRF state, got ${res.status}`
      );
      const location = res.headers.get('location') || '';
      assert.ok(
        location.toLowerCase().includes('error') || location.toLowerCase().includes('csrf'),
        `Expected error or csrf in redirect location, got ${location}`
      );
    });
  });
});
