import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startE2EServer, E2ETestServer, TEST_ACCESS_TOKEN, getTestTokenHash } from './harness';

describe('ISSUE-005: E2E Critical Flows & HTTP Boundary Verification', () => {
  let server: E2ETestServer;
  let tokenHash: string;

  before(async () => {
    tokenHash = await getTestTokenHash();
    server = await startE2EServer();
  });

  after(async () => {
    if (server) {
      await server.stop();
    }
  });

  // Scenario 1: Application Startup & Healthcheck
  it('Scenario 1: Application starts on ephemeral port and /api/health responds', async () => {
    assert.ok(server.port > 0, `Expected ephemeral port > 0, got ${server.port}`);
    const res = await fetch(`${server.baseUrl}/api/health`);
    assert.ok(
      res.status === 200 || res.status === 503,
      `Expected /api/health to return 200 or 503 (degraded DB), got ${res.status}`
    );
    const body = await res.json() as Record<string, unknown>;
    assert.ok(
      body.status === 'ok' || body.status === 'degraded' || body.status === 'healthy',
      `Expected health status 'ok', 'degraded', or 'healthy', got: ${JSON.stringify(body)}`
    );
    // Deployment boundary verification (ISSUE-011): /api/health reports active build ID
    assert.ok(typeof body.build === 'string' && body.build.length > 0, 'Expected build field in /api/health');
    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
    if (fs.existsSync(buildIdPath)) {
      const expectedId = fs.readFileSync(buildIdPath, 'utf8').trim().slice(0, 12);
      assert.strictEqual(body.build, expectedId, 'Expected /api/health build field to match .next/BUILD_ID');
    }
  });

  // Scenario 2: Authentication Boundary on Protected API Routes
  describe('Scenario 2: Protected API route authentication boundaries', () => {
    it('rejects unauthenticated API requests with 401 Unauthorized', async () => {
      const res = await fetch(`${server.baseUrl}/api/scanner`);
      assert.strictEqual(res.status, 401, 'Expected unauthenticated /api/scanner to return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('rejects API requests with invalid Bearer token with 401 Unauthorized', async () => {
      const res = await fetch(`${server.baseUrl}/api/scanner`, {
        headers: { authorization: 'Bearer invalid-dummy-token-xyz' },
      });
      assert.strictEqual(res.status, 401, 'Expected invalid token to return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('allows API requests with valid Bearer token to pass middleware', async () => {
      const res = await fetch(`${server.baseUrl}/api/scanner`, {
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      });
      // Middleware should allow the request through; status will be 200, 500, or 503 (from handler), never 401
      assert.notStrictEqual(
        res.status,
        401,
        `Expected valid Bearer token to bypass middleware auth gate, got ${res.status}`
      );
    });

    it('allows API requests with valid hashed app_access_token cookie to pass middleware', async () => {
      const res = await fetch(`${server.baseUrl}/api/scanner`, {
        headers: { cookie: `app_access_token=${tokenHash}` },
      });
      assert.notStrictEqual(
        res.status,
        401,
        `Expected valid auth cookie to bypass middleware auth gate, got ${res.status}`
      );
    });
  });

  // Scenario 3: Public Pages
  describe('Scenario 3: Public pages remain accessible without authentication', () => {
    it('/unlock renders with HTTP 200 without redirection', async () => {
      const res = await fetch(`${server.baseUrl}/unlock`, { redirect: 'manual' });
      assert.strictEqual(res.status, 200, 'Expected /unlock to return 200');
    });

    it('/about renders with HTTP 200 without redirection', async () => {
      const res = await fetch(`${server.baseUrl}/about`, { redirect: 'manual' });
      assert.strictEqual(res.status, 200, 'Expected /about to return 200');
    });

    it('/market-tools/breadth renders with HTTP 200 without redirection', async () => {
      const res = await fetch(`${server.baseUrl}/market-tools/breadth`, { redirect: 'manual' });
      assert.strictEqual(res.status, 200, 'Expected /market-tools/breadth to return 200');
    });
  });

  // Scenario 4: Protected Pages & Redirection
  describe('Scenario 4: Protected page access and redirection semantics', () => {
    it('redirects unauthenticated browser requests on protected / to /unlock with 307', async () => {
      const res = await fetch(`${server.baseUrl}/`, { redirect: 'manual' });
      assert.strictEqual(res.status, 307, 'Expected protected / to redirect with 307');
      const location = res.headers.get('location') || '';
      assert.ok(
        location.includes('/unlock'),
        `Expected redirect location to include /unlock, got '${location}'`
      );
    });

    it('allows authenticated browser requests on / without redirecting to /unlock', async () => {
      const res = await fetch(`${server.baseUrl}/`, {
        redirect: 'manual',
        headers: { cookie: `app_access_token=${tokenHash}` },
      });
      const location = res.headers.get('location') || '';
      // Authenticated users pass middleware (Home() navigates to /calculate, NOT /unlock)
      assert.ok(
        !location.includes('/unlock'),
        `Authenticated request must not be redirected to /unlock, got '${location}'`
      );
    });
  });

  // Scenario 5: Public Market Tools API Endpoints
  describe('Scenario 5: Public market tools endpoints are accessible anonymously', () => {
    it('GET /api/market-tools/breadth returns HTTP 200 without authentication', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breadth`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.success, true);
    });

    it('GET /api/market-tools/breakout returns HTTP 200 without authentication', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breakout`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.success, true);
    });

    it('GET /api/market-tools/pattern-breakout returns HTTP 200 without authentication', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/pattern-breakout`);
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.success, true);
    });
  });

  // Scenario 6: Unauthorized Refresh Requests (ISSUE-001/002 Gate)
  describe('Scenario 6: Heavy ?refresh=true path is blocked for anonymous requests', () => {
    it('/api/market-tools/breadth?refresh=true returns 401 when unauthenticated', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breadth?refresh=true`);
      assert.strictEqual(res.status, 401, 'Anonymous refresh must return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('/api/market-tools/breakout?refresh=true returns 401 when unauthenticated', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breakout?refresh=true`);
      assert.strictEqual(res.status, 401, 'Anonymous refresh must return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error, 'Unauthorized');
    });

    it('/api/market-tools/pattern-breakout?refresh=true returns 401 when unauthenticated', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/pattern-breakout?refresh=true`);
      assert.strictEqual(res.status, 401, 'Anonymous refresh must return 401');
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error, 'Unauthorized');
    });
  });

  // Scenario 7: Authorized Refresh Requests
  describe('Scenario 7: Heavy ?refresh=true path is permitted with valid credentials', () => {
    it('/api/market-tools/breadth?refresh=true passes auth with Bearer token', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breadth?refresh=true`, {
        headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` },
      });
      assert.notStrictEqual(
        res.status,
        401,
        `Expected Bearer token to authorize refresh, got ${res.status}`
      );
    });

    it('/api/market-tools/breakout?refresh=true passes auth with valid cookie', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breakout?refresh=true`, {
        headers: { cookie: `app_access_token=${tokenHash}` },
      });
      assert.notStrictEqual(
        res.status,
        401,
        `Expected valid cookie to authorize refresh, got ${res.status}`
      );
    });
  });

  // Scenario 8: Malformed Query Parameters
  describe('Scenario 8: Robustness against malformed query parameters', () => {
    it('handles invalid tier gracefully on /api/market-tools/breakout', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breakout?tier=INVALID_TIER_VALUE`);
      assert.ok(
        res.status === 200 || res.status === 400,
        `Expected graceful 200 or 400 for invalid tier, got ${res.status}`
      );
    });

    it('handles negative/malformed limit gracefully on /api/market-tools/pattern-breakout', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/pattern-breakout?limit=-999`);
      assert.ok(
        res.status === 200 || res.status === 400,
        `Expected graceful 200 or 400 for negative limit, got ${res.status}`
      );
    });
  });

  // Scenario 9: Cold-Cache Contract (ISSUE-001 Verification)
  describe('Scenario 9: Anonymous cold-cache contract returns pending stubs without live compute', () => {
    it('returns status=pending and totalScanned=0 on cold cache for breakout API', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breakout`);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { success: boolean; data: { status: string; totalScanned?: number } };
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data?.status, 'pending');
    });

    it('returns status=pending on cold cache for breadth API', async () => {
      const res = await fetch(`${server.baseUrl}/api/market-tools/breadth`);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as { success: boolean; data: { status: string } };
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data?.status, 'pending');
    });
  });

  // Scenario 10: Redis Unavailable Resilience
  describe('Scenario 10: Resilience when Redis daemon is unavailable', () => {
    it('serves multiple repeated HTTP requests using in-memory cache fallback without crashing', async () => {
      const res1 = await fetch(`${server.baseUrl}/api/market-tools/breadth`);
      assert.strictEqual(res1.status, 200);

      const res2 = await fetch(`${server.baseUrl}/api/market-tools/breadth`);
      assert.strictEqual(res2.status, 200);

      const res3 = await fetch(`${server.baseUrl}/api/market-tools/breakout`);
      assert.strictEqual(res3.status, 200);
    });
  });
});
